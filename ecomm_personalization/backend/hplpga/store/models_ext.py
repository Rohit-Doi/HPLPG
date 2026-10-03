"""Additional storefront tables: wishlist, cart, reviews, points ledger, coupon redemptions, settings, rich events.

All behaviour is written here so it can feed the next training run (see `export.py`):
  events(user_id | visitor_id, type, item_id, meta_json, ts)   <- impressions, clicks, views, carts, wishlists,
                                                                  searches, filters, purchases, review posts
"""
from __future__ import annotations

import time

from sqlalchemy import Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class WishlistItem(Base):
    __tablename__ = "wishlist"
    __table_args__ = (UniqueConstraint("user_id", "item_id", name="uq_wishlist"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    size: Mapped[str] = mapped_column(String(16), default="")
    ts: Mapped[float] = mapped_column(Float, default=time.time)


class CartItem(Base):
    __tablename__ = "cart"
    __table_args__ = (UniqueConstraint("user_id", "item_id", "size", name="uq_cart"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    size: Mapped[str] = mapped_column(String(16), default="")
    qty: Mapped[int] = mapped_column(Integer, default=1)
    ts: Mapped[float] = mapped_column(Float, default=time.time)


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[str] = mapped_column(String(32), index=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    author: Mapped[str] = mapped_column(String(80), default="AURA shopper")
    rating: Mapped[int] = mapped_column(Integer)                 # 1..5
    title: Mapped[str] = mapped_column(String(120), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    size_fit: Mapped[str] = mapped_column(String(16), default="")   # small | true | large
    verified: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(16), default="user")  # user | demo
    helpful: Mapped[int] = mapped_column(Integer, default=0)
    ts: Mapped[float] = mapped_column(Float, default=time.time)


class PointsLedger(Base):
    __tablename__ = "points_ledger"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(120))
    ref: Mapped[str] = mapped_column(String(64), default="")
    ts: Mapped[float] = mapped_column(Float, default=time.time)


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    visitor_id: Mapped[str] = mapped_column(String(64), default="")
    code: Mapped[str] = mapped_column(String(32))
    order_id: Mapped[str] = mapped_column(String(24))
    discount: Mapped[float] = mapped_column(Float, default=0.0)
    ts: Mapped[float] = mapped_column(Float, default=time.time)


class RichEvent(Base):
    """Behavioural event store (superset of user_events) used for analytics and retraining."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=True, index=True)
    visitor_id: Mapped[str] = mapped_column(String(64), index=True, default="")
    type: Mapped[str] = mapped_column(String(32), index=True)   # impression|click|view_item|add_to_cart|wishlist|search|filter|purchase|review|page
    item_id: Mapped[str] = mapped_column(String(32), default="")
    page_id: Mapped[str] = mapped_column(String(24), default="")
    module_id: Mapped[str] = mapped_column(String(32), default="")
    meta_json: Mapped[str] = mapped_column(Text, default="{}")
    device: Mapped[str] = mapped_column(String(16), default="")
    channel: Mapped[str] = mapped_column(String(32), default="")
    region: Mapped[str] = mapped_column(String(64), default="")
    ts: Mapped[float] = mapped_column(Float, default=time.time, index=True)
