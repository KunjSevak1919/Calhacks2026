"""Shared message Models for agent-to-agent traffic between Pocket Pilot
(the front door) and its two specialists: Card Scorer and Payment Planner.

Every request/response carries request_id so both sides can log a
correlated trail ("[req-id] Card Scorer answered...") even though
ctx.send_and_receive already correlates replies under the hood.
"""
from typing import List, Optional

from uagents import Field, Model


class CardSummary(Model):
    name: str
    net: Optional[float] = None
    reward: Optional[float] = None
    interest: Optional[float] = None
    rate_label: Optional[str] = None
    apr: Optional[float] = None


class ScoreRequest(Model):
    request_id: str
    merchant: Optional[str] = None
    mcc: Optional[str] = None
    amount: float
    debt_guard: Optional[bool] = None


class ScoreResponse(Model):
    request_id: str
    ok: bool
    best: Optional[CardSummary] = None
    runner_up: Optional[CardSummary] = None
    ranked: List[CardSummary] = Field(default_factory=list)
    reason: Optional[str] = None
    category: Optional[str] = None
    mcc: Optional[str] = None
    confidence: Optional[float] = None
    source: Optional[str] = None
    note: Optional[str] = None
    error: Optional[str] = None


class ResolveRequest(Model):
    request_id: str
    merchant: Optional[str] = None
    mcc: Optional[str] = None
    place_types: Optional[List[str]] = None
    domain: Optional[str] = None


class ResolveResponse(Model):
    request_id: str
    ok: bool
    merchant: Optional[str] = None
    category: Optional[str] = None
    label: Optional[str] = None
    mcc: Optional[str] = None
    confidence: Optional[float] = None
    source: Optional[str] = None
    note: Optional[str] = None
    needs_paid_lookup: bool = False
    error: Optional[str] = None


class NotificationSummary(Model):
    id: str
    kind: str
    title: str
    body: str
    actions: List[str] = Field(default_factory=list)


class DueSoonRequest(Model):
    request_id: str


class DueSoonResponse(Model):
    request_id: str
    ok: bool
    notifications: List[NotificationSummary] = Field(default_factory=list)
    error: Optional[str] = None


class ExecuteActionRequest(Model):
    request_id: str
    sender: str
    action: str  # "approve" or "dismiss"
    note_id: str


class ExecuteActionResponse(Model):
    request_id: str
    ok: bool
    message: Optional[str] = None
    error: Optional[str] = None
    # True only when the server said this note is gone (already handled).
    not_found: bool = False


class PayRequest(Model):
    request_id: str
    merchant: Optional[str] = None
    amount: float
    card: Optional[str] = None


class PayResponse(Model):
    request_id: str
    ok: bool
    message: Optional[str] = None
    error: Optional[str] = None
    not_found: bool = False


class ImpactRequest(Model):
    request_id: str


class ImpactResponse(Model):
    request_id: str
    ok: bool
    message: Optional[str] = None
    error: Optional[str] = None
