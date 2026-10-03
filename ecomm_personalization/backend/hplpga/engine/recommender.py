"""Hybrid cold-start recommender - the scoring core used by BOTH offline evaluation and the live agent.

Each component yields a probability distribution over the catalog for a visitor context:

  pop      all-time user-share popularity                      (global fallback)
  trend    time-decayed popularity (half-life 21d)             ("trending now")
  ctx      weighted mix of hierarchical back-off chains        (geo, place, time, landing, season, demo, demo x geo)
  knn      K nearest historical visitors by weighted context   ("popular with shoppers like you")
  dept     LightGBM department affinity x in-department trend  (inferred interest)
  persona  LightGBM persona membership x persona item mix      (segment-level taste)
  session  item-item co-view + next-item transitions           (warm-up once behaviour exists)

Final score = sum_c w_c * component_c (weights and chain weights tuned on a validation month), optionally
re-ranked by a LightGBM LambdaRank model (see ltr.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import features as F

COMPONENTS = ["pop", "trend", "ctx", "knn", "dept", "persona", "session"]
DEFAULT_WEIGHTS = {"pop": 0.05, "trend": 0.1, "ctx": 0.3, "knn": 0.35, "dept": 0.1, "persona": 0.05, "session": 6.0}


class Artifacts:
    def __init__(self, model_dir: Path):
        self.dir = Path(model_dir)
        a = joblib.load(self.dir / "model.joblib")
        self.__dict__.update(a)
        self.n_items = len(self.items)
        self.persona_count = self.persona_items.shape[0]


@dataclass
class ScoreResult:
    scores: np.ndarray                       # (n, I) blended
    components: dict[str, np.ndarray]        # each (n, I)
    chains: dict[str, np.ndarray]            # per back-off chain (n, I)
    dept_proba: np.ndarray                   # (n, D)
    persona_proba: np.ndarray                # (n, P)
    intent: dict[str, np.ndarray]            # name -> (n,)
    backoff: list[list[dict]] = field(default_factory=list)


class Recommender:
    def __init__(self, art: Artifacts, weights: dict | None = None, alpha: float = 30.0,
                 chain_weights: dict | None = None, knn_k: int = 300, gender_boost: float = 3.0, trans_mix: float = 0.5):
        self.a = art
        self.weights = {**DEFAULT_WEIGHTS, **(weights or {})}
        self.alpha = alpha
        self.chain_weights = {**F.DEFAULT_CHAIN_WEIGHTS, **(chain_weights or {})}
        self.knn_k = knn_k
        self.gender_boost = gender_boost      # kNN weight multiplier on gender when it is declared
        self.trans_mix = trans_mix            # share of next-item transitions inside the session signal
        self._prior_cache: dict = {}
        self._uniform = np.full(art.n_items, 1.0 / art.n_items, np.float32)

    # ------------------------------------------------------------------ back-off priors
    def _chain(self, row: dict, levels: list[tuple[str, ...]], trace: list | None) -> np.ndarray:
        """Recursive Dirichlet smoothing from the global root down to the most specific cell."""
        root = self.a.priors[()]
        p = (root["M"][0] + 1.0 * self._uniform) / (root["N"][0] + 1.0)
        for fields in reversed(levels[:-1]):  # general -> specific (skip root)
            pr = self.a.priors.get(fields)
            if pr is None:
                continue
            key = "|".join(str(row[f]) for f in fields)
            j = pr["index"].get(key)
            if j is None:
                if trace is not None:
                    trace.append({"level": "+".join(fields), "key": key, "support": 0, "weight": 0.0})
                continue
            n = float(pr["N"][j])
            p = (pr["M"][j] + self.alpha * p) / (n + self.alpha)
            if trace is not None:
                trace.append({"level": "+".join(fields), "key": key, "support": int(n), "weight": round(n / (n + self.alpha), 3)})
        return p

    def chain_priors(self, row: dict, use_demo: bool, want_trace: bool = False) -> tuple[dict[str, np.ndarray], list]:
        key = tuple(str(row.get(f)) for f in F.KEY_FEATURES) + (use_demo, self.alpha)
        if not want_trace and key in self._prior_cache:
            return self._prior_cache[key], []
        demo_ok = use_demo and row.get("gender", F.UNKNOWN) != F.UNKNOWN
        out, trace = {}, []
        for chain, levels in F.CHAINS.items():
            if chain in F.DEMO_CHAINS and not demo_ok:
                continue
            out[chain] = self._chain(row, levels, trace if want_trace else None)
        if len(self._prior_cache) < 300_000:
            self._prior_cache[key] = out
        return out, trace

    def mix_chains(self, chains: dict[str, np.ndarray]) -> np.ndarray:
        acc, tot = None, 0.0
        for c, v in chains.items():
            w = self.chain_weights.get(c, 0.0)
            if w <= 0:
                continue
            acc = w * v if acc is None else acc + w * v
            tot += w
        return acc / max(tot, 1e-9) if acc is not None else np.broadcast_to(self.a.pop, next(iter(chains.values())).shape).copy()

    # ------------------------------------------------------------------ kNN
    def knn(self, ctx: pd.DataFrame, use_demo: bool, batch: int = 256) -> np.ndarray:
        kn = self.a.knn
        vocab, w = kn["vocab"], kn["weights"]
        feats = [f for f in F.CAT_FEATURES if use_demo or f not in F.DEMO_FEATURES]
        out = np.zeros((len(ctx), self.a.n_items), np.float32)
        rng = np.random.default_rng(0)
        jitter = rng.random(kn["U"].shape[0]).astype(np.float32) * 1e-3  # random tie-break
        for s in range(0, len(ctx), batch):
            part = ctx.iloc[s:s + batch]
            rows, cols, vals = [], [], []
            for i, (_, r) in enumerate(part.iterrows()):
                for f in feats:
                    if f in F.DEMO_FEATURES and r[f] == F.UNKNOWN:
                        continue
                    j = vocab.get((f, str(r[f])))
                    if j is not None:
                        rows.append(i); cols.append(j)
                        vals.append(w[f] * (self.gender_boost if f == "gender" else 1.0))
            Q = sp.csr_matrix((vals, (rows, cols)), shape=(len(part), len(vocab)), dtype=np.float32)
            S = (kn["U"] @ Q.T).toarray() + jitter[:, None]        # (pool, b)
            k = min(self.knn_k, S.shape[0])
            top = np.argpartition(-S, k - 1, axis=0)[:k]
            for b in range(S.shape[1]):
                idx = top[:, b]
                sims = S[idx, b]
                sims = np.exp((sims - sims.max()) * 4.0)
                out[s + b] = np.asarray(kn["R"][idx].T @ sims).ravel()
        out += 1e-6
        return out / out.sum(1, keepdims=True)

    # ------------------------------------------------------------------ session graph
    def session_scores(self, session_items: list[list[str]]) -> np.ndarray:
        out = np.zeros((len(session_items), self.a.n_items), np.float32)
        for i, its in enumerate(session_items):
            for rank, it in enumerate(its or []):
                j = self.a.item_idx.get(it)
                if j is None:
                    continue
                decay = 0.7 ** rank                                 # most recent item counts most
                if j in self.a.coview:
                    nb, sim = self.a.coview[j]
                    out[i, nb] += (1 - self.trans_mix) * sim * decay
                if j in self.a.transitions:
                    nb, pr = self.a.transitions[j]
                    out[i, nb] += self.trans_mix * pr * decay
            s = out[i].sum()
            if s > 0:
                out[i] /= s
        return out

    # ------------------------------------------------------------------ main entry
    def score(self, ctx: pd.DataFrame, session_items: list[list[str]] | None = None, use_demo: bool = True,
              components: list[str] | None = None, want_trace: bool = False) -> ScoreResult:
        a = self.a
        n = len(ctx)
        comps = components or COMPONENTS
        C: dict[str, np.ndarray] = {}
        ctx_model = ctx if use_demo else F.mask_demographics(ctx)
        X = F.to_model_frame(ctx_model, a.categories)
        dept_p = a.dept_model.predict_proba(X)
        pers_p = a.persona_model.predict_proba(X)
        intent = {k: m.predict_proba(X)[:, 1] for k, (m, _) in a.intent_models.items()}

        if "pop" in comps:
            C["pop"] = np.broadcast_to(a.pop, (n, a.n_items))
        if "trend" in comps:
            C["trend"] = np.broadcast_to(a.trend, (n, a.n_items))
        chains: dict[str, np.ndarray] = {}
        backoff: list = []
        if "ctx" in comps:
            per_row = []
            for r in ctx.to_dict("records"):
                ch, tr = self.chain_priors(r, use_demo, want_trace)
                per_row.append(ch)
                backoff.append(tr)
            for c in F.CHAINS:
                if any(c in ch for ch in per_row):
                    chains[c] = np.vstack([ch.get(c, a.pop) for ch in per_row])
            C["ctx"] = np.vstack([self.mix_chains(ch) for ch in per_row])
        if "knn" in comps:
            C["knn"] = self.knn(ctx, use_demo)
        if "dept" in comps:
            T = np.stack([a.trend_in_dept[d] for d in a.dept_classes])     # (D, I)
            C["dept"] = dept_p @ T
        if "persona" in comps:
            C["persona"] = pers_p @ a.persona_items
        if "session" in comps and session_items is not None:
            C["session"] = self.session_scores(session_items)

        total = np.zeros((n, a.n_items), np.float32)
        for k, v in C.items():
            total += self.weights.get(k, 0.0) * v
        return ScoreResult(total, C, chains, dept_p, pers_p, intent, backoff)

    # ------------------------------------------------------------------ helpers
    def audience_multiplier(self, gender: str | None, preferred_department: str | None = None, strength: float = 1.0) -> np.ndarray:
        """Merchandising rule: favour products whose target audience matches a declared gender / interest."""
        m = np.ones(self.a.n_items, np.float32)
        aud = np.asarray(self.a.audience)
        if gender in ("female", "male"):
            want = "women" if gender == "female" else "men"
            other = "men" if want == "women" else "women"
            m *= np.where(aud == want, 1 + 0.8 * strength, np.where(aud == other, 1 - 0.7 * strength, 1.0)).astype(np.float32)
        if preferred_department:
            m *= np.where(np.asarray(self.a.dept_of) == preferred_department, 1 + 1.5 * strength, 1 - 0.5 * strength).astype(np.float32)
        return m

    def top_k(self, scores: np.ndarray, k: int, exclude: list[set[int]] | None = None) -> np.ndarray:
        s = np.array(scores, dtype=np.float32, copy=True)
        if exclude:
            for i, ex in enumerate(exclude):
                if ex:
                    s[i, list(ex)] = -np.inf
        k = min(k, s.shape[1])
        part = np.argpartition(-s, k - 1, axis=1)[:, :k]
        order = np.take_along_axis(s, part, 1).argsort(1)[:, ::-1]
        return np.take_along_axis(part, order, 1)
