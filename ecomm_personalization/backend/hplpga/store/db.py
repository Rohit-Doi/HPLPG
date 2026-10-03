"""Storefront persistence (SQLite via SQLAlchemy): users, profiles, addresses, orders, user events.

The recommendation models are read-only artifacts; this database holds everything a real shop writes:
accounts, the onboarding profile that feeds Level-2 personalization, and the browsing / order history
that turns a returning customer into a Level-4 visitor.
"""
from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import Float, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .. import config as C

DB_URL = os.getenv("HPLPGA_DATABASE_URL", f"sqlite:///{(C.ARTIFACTS_DIR / 'store.db').as_posix()}")
engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {}, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    provider: Mapped[str] = mapped_column(String(32), default="password")   # password | google | apple
    provider_sub: Mapped[str] = mapped_column(String(255), default="")
    avatar: Mapped[str] = mapped_column(String(512), default="")
    points: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    last_login: Mapped[float] = mapped_column(Float, default=time.time)
    profile_json: Mapped[str] = mapped_column(Text, default="{}")          # onboarding answers

    @property
    def profile(self) -> dict:
        return json.loads(self.profile_json or "{}")


class Address(Base):
    __tablename__ = "addresses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    is_default: Mapped[int] = mapped_column(Integer, default=0)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(24), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=True)
    visitor_id: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[float] = mapped_column(Float, default=time.time)
    status: Mapped[str] = mapped_column(String(32), default="confirmed")
    total: Mapped[float] = mapped_column(Float, default=0.0)
    data_json: Mapped[str] = mapped_column(Text, default="{}")


class UserEvent(Base):
    __tablename__ = "user_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True, nullable=True)
    visitor_id: Mapped[str] = mapped_column(String(64), index=True, default="")
    type: Mapped[str] = mapped_column(String(32))
    item_id: Mapped[str] = mapped_column(String(32), default="")
    ts: Mapped[float] = mapped_column(Float, default=time.time)


def init_db() -> None:
    C.ensure_dirs()
    from . import models_ext  # noqa: F401 - registers the extra tables
    Base.metadata.create_all(engine)


@contextmanager
def session() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def user_history(user_id: int | None, visitor_id: str | None, days: int = 90, limit: int = 60) -> dict:
    """Recent item interactions of a known user (or anonymous visitor id) for Level-4 personalization."""
    if not user_id and not visitor_id:
        return {"viewed": [], "carted": [], "purchased": []}
    since = time.time() - days * 86400
    with session() as s:
        q = select(UserEvent).where(UserEvent.ts >= since)
        q = q.where(UserEvent.user_id == user_id) if user_id else q.where(UserEvent.visitor_id == visitor_id)
        rows = s.execute(q.order_by(UserEvent.ts.desc()).limit(500)).scalars().all()
    out = {"viewed": [], "carted": [], "purchased": []}
    key = {"view_item": "viewed", "add_to_cart": "carted", "purchase": "purchased"}
    for r in rows:
        k = key.get(r.type)
        if k and r.item_id and r.item_id not in out[k] and len(out[k]) < limit:
            out[k].append(r.item_id)
    return out
