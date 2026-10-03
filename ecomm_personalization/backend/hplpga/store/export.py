"""Export live behaviour to parquet in the training schema, so the next pipeline run can learn from it.

    python -m hplpga.store.export

Writes artifacts/feedback/interactions.parquet (uid, sid, ts, event, item_id, weight) and
artifacts/feedback/users.parquet (first-touch context + declared profile) plus events.parquet (everything).
`train.load_tables()` can concatenate these with the historical tables (see README, "closing the loop").
"""
from __future__ import annotations

import json

import pandas as pd
from sqlalchemy import select

from .. import config as C
from .db import User, UserEvent, session
from .models_ext import RichEvent


def run() -> dict:
    out = C.ARTIFACTS_DIR / "feedback"
    out.mkdir(parents=True, exist_ok=True)
    with session() as s:
        ue = pd.DataFrame([{"user_id": r.user_id, "visitor_id": r.visitor_id, "type": r.type, "item_id": r.item_id, "ts": r.ts}
                           for r in s.execute(select(UserEvent)).scalars()])
        ev = pd.DataFrame([{"user_id": r.user_id, "visitor_id": r.visitor_id, "type": r.type, "item_id": r.item_id, "page_id": r.page_id,
                            "module_id": r.module_id, "meta": r.meta_json, "device": r.device, "channel": r.channel, "region": r.region, "ts": r.ts}
                           for r in s.execute(select(RichEvent)).scalars()])
        users = pd.DataFrame([{"user_id": u.id, "email_hash": hash(u.email) % 10**12, "created_at": u.created_at, "points": u.points,
                               **{k: v for k, v in u.profile.items() if k in ("gender", "ageGroup", "country", "region", "preferredDepartments", "styles", "budget")}}
                              for u in s.execute(select(User)).scalars()])
    if len(ue):
        ue["uid"] = ue["user_id"].fillna(-1).astype(int)
        ue["actor"] = ue["user_id"].fillna(ue["visitor_id"]).astype(str)
        ue = ue.sort_values("ts")
        gap = ue.groupby("actor")["ts"].diff().fillna(1e9) > 30 * 60
        ue["sid"] = gap.cumsum().astype(int)
        ue["event"] = ue["type"]
        ue["weight"] = ue["event"].map(C.EVENT_WEIGHTS).fillna(1.0)
        ue["ts"] = pd.to_datetime(ue["ts"], unit="s")
        ue[["uid", "actor", "sid", "ts", "event", "item_id", "weight"]].to_parquet(out / "interactions.parquet", index=False)
    if len(ev):
        ev.to_parquet(out / "events.parquet", index=False)
    if len(users):
        users.to_parquet(out / "users.parquet", index=False)
    summary = {"interactions": int(len(ue)), "events": int(len(ev)), "users": int(len(users)), "dir": str(out)}
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(summary)
    return summary


if __name__ == "__main__":
    run()
