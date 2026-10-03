"""Online learning layer: A/B experiment bucketing + a Thompson-sampling bandit over module order.

The offline pipeline decides *what* goes on the page; this layer learns *in which order* from live
impressions and clicks, per (intent stage, device). Each module slot is a Bernoulli arm with a
Beta(alpha, beta) posterior. The offline layout is encoded as the prior (earlier position = larger
alpha), so with no traffic the page is exactly the offline layout, and it drifts only as evidence arrives.

Events are appended to a JSONL log so the state survives restarts (replayed on startup).
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

FIXED_FIRST = ("announcement", "hero", "hero_carousel", "offer_strip", "recall")
FIXED_LAST = ("trust",)
CONTROL_SHARE = 0.10          # share of visitors served the popularity-only control page
PRIOR_STRENGTH = 60.0         # pseudo-impressions behind the offline order (order only moves with real evidence)


class ExperimentState:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.rng = np.random.default_rng()
        # (stage, device) -> module_id -> [alpha, beta]
        self.arms: dict[tuple[str, str], dict[str, list[float]]] = defaultdict(dict)
        self.variant_stats: dict[str, dict] = defaultdict(lambda: {"pages": 0, "impressions": 0, "clicks": 0, "view_item": 0, "add_to_cart": 0})
        self.module_stats: dict[str, dict] = defaultdict(lambda: {"impressions": 0, "clicks": 0})
        self.pages: dict[str, dict] = {}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._replay()

    # ------------------------------------------------------------------ bucketing
    @staticmethod
    def variant_for(visitor_id: str | None, override: str | None = None) -> tuple[str, float]:
        if override in ("agent", "control"):
            return override, -1.0
        if not visitor_id:
            return "agent", -1.0
        h = int(hashlib.sha1(visitor_id.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        return ("control" if h < CONTROL_SHARE else "agent"), round(h, 4)

    # ------------------------------------------------------------------ bandit
    def _ensure(self, key: tuple[str, str], order: list[str]) -> dict[str, list[float]]:
        arms = self.arms[key]
        n = len(order)
        for pos, mid in enumerate(order):
            if mid not in arms:
                # prior mean decreases with offline position; strength = PRIOR_STRENGTH pseudo-impressions
                mean = 0.6 - 0.4 * pos / max(n - 1, 1)
                arms[mid] = [1 + PRIOR_STRENGTH * mean, 1 + PRIOR_STRENGTH * (1 - mean)]
        return arms

    def order_modules(self, stage: str, device: str, modules: list[dict]) -> tuple[list[dict], bool]:
        """Thompson-sample an order for the movable middle modules. Returns (modules, changed)."""
        ids = [m["id"] for m in modules]
        key = (stage, device)
        with self.lock:
            arms = self._ensure(key, ids)
            head = [m for m in modules if m["id"] in FIXED_FIRST]
            tail = [m for m in modules if m["id"] in FIXED_LAST]
            mid = [m for m in modules if m["id"] not in FIXED_FIRST and m["id"] not in FIXED_LAST]
            theta = {m["id"]: self.rng.beta(*arms[m["id"]]) for m in mid}
        new_mid = sorted(mid, key=lambda m: -theta[m["id"]])
        changed = [m["id"] for m in new_mid] != [m["id"] for m in mid]
        return head + new_mid + tail, changed

    def register_page(self, page_id: str, stage: str, device: str, variant: str, module_ids: list[str]) -> None:
        with self.lock:
            self.pages[page_id] = {"stage": stage, "device": device, "variant": variant, "modules": module_ids, "ts": time.time()}
            if len(self.pages) > 20_000:
                for k in list(self.pages)[:5000]:
                    self.pages.pop(k, None)
            self.variant_stats[variant]["pages"] += 1

    # ------------------------------------------------------------------ events
    def record(self, ev: dict, persist: bool = True) -> None:
        meta = self.pages.get(ev.get("pageId") or "", {})
        ev = {**ev, "stage": meta.get("stage"), "device": meta.get("device"), "variant": meta.get("variant", "agent"), "ts": ev.get("ts") or time.time()}
        with self.lock:
            self._apply(ev)
        if persist:
            with self.lock, self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(ev) + "\n")

    def _apply(self, ev: dict) -> None:
        t, mid, variant = ev.get("type"), ev.get("moduleId"), ev.get("variant", "agent")
        vs = self.variant_stats[variant]
        if t == "impression":
            vs["impressions"] += 1
        elif t == "click":
            vs["clicks"] += 1
        elif t in ("view_item", "add_to_cart"):
            vs[t] += 1
        if mid and t in ("impression", "click"):
            ms = self.module_stats[mid]
            ms["impressions" if t == "impression" else "clicks"] += 1
            if ev.get("stage") and ev.get("device"):
                arms = self.arms[(ev["stage"], ev["device"])]
                if mid in arms:
                    if t == "click":
                        arms[mid][0] += 1
                    else:
                        arms[mid][1] += 1

    def _replay(self) -> None:
        if not self.path.exists():
            return
        with self.path.open(encoding="utf-8") as f:
            for line in f:
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if ev.get("stage") and ev.get("device") and ev.get("moduleId"):
                    self.arms[(ev["stage"], ev["device"])].setdefault(ev["moduleId"], [1 + PRIOR_STRENGTH * 0.4, 1 + PRIOR_STRENGTH * 0.6])
                self._apply(ev)

    # ------------------------------------------------------------------ reporting
    def summary(self) -> dict:
        with self.lock:
            variants = {}
            for v, s in self.variant_stats.items():
                variants[v] = {**s, "ctr": round(s["clicks"] / s["impressions"], 4) if s["impressions"] else None,
                               "clicksPerPage": round(s["clicks"] / s["pages"], 3) if s["pages"] else None}
            modules = {m: {**s, "ctr": round(s["clicks"] / s["impressions"], 4) if s["impressions"] else None}
                       for m, s in self.module_stats.items()}
            bandit = []
            for (stage, device), arms in self.arms.items():
                bandit.append({"stage": stage, "device": device,
                               "arms": sorted([{"module": m, "alpha": round(a, 1), "beta": round(b, 1), "mean": round(a / (a + b), 3),
                                                "evidence": int(a + b - 2 - PRIOR_STRENGTH)} for m, (a, b) in arms.items()], key=lambda x: -x["mean"])})
        return {"controlShare": CONTROL_SHARE, "variants": variants, "modules": modules, "bandit": bandit,
                "description": ("Visitors are hashed into 'agent' (90%) or 'control' (10%, popularity-only products, same layout). "
                                "Module order per stage x device is learned online by Thompson sampling with the offline layout as prior.")}
