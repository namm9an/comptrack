from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class UserOut(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    created_at: str
    last_login: Optional[str] = None


# ---------------------------------------------------------------------------
# Competitors
# ---------------------------------------------------------------------------

class TrackedIndividualIn(BaseModel):
    name: str
    title: Optional[str] = None
    twitter_handle: Optional[str] = None
    linkedin_url: Optional[str] = None


class TrackedIndividualOut(TrackedIndividualIn):
    id: int
    competitor_id: int


class CompetitorIn(BaseModel):
    name: str
    category: str  # e2e_cloud | tir | both
    website_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    linkedin_url: Optional[str] = None
    individuals: list[TrackedIndividualIn] = []

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in ("e2e_cloud", "tir", "both"):
            raise ValueError("category must be 'e2e_cloud', 'tir', or 'both'")
        return v


class CompetitorUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    website_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    linkedin_url: Optional[str] = None
    active: Optional[bool] = None


class CompetitorOut(BaseModel):
    id: int
    name: str
    category: str
    website_url: Optional[str] = None
    twitter_handle: Optional[str] = None
    linkedin_url: Optional[str] = None
    active: bool
    added_by: Optional[str] = None
    created_at: str
    individuals: list[TrackedIndividualOut] = []
    latest_digest: Optional[DigestOut] = None


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

class SuggestionIn(BaseModel):
    name: str
    category: str
    website_url: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in ("e2e_cloud", "tir", "both"):
            raise ValueError("category must be 'e2e_cloud', 'tir', or 'both'")
        return v


class SuggestionOut(BaseModel):
    id: int
    suggested_by: str
    name: str
    category: str
    website_url: Optional[str] = None
    notes: Optional[str] = None
    status: str
    reviewed_by: Optional[str] = None
    created_at: str
    reviewed_at: Optional[str] = None


class SuggestionReview(BaseModel):
    status: str  # approved | rejected

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("approved", "rejected"):
            raise ValueError("status must be 'approved' or 'rejected'")
        return v


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

class JobTriggerIn(BaseModel):
    competitor_id: Optional[int] = None  # None = run for all active competitors
    job_type: str  # daily | weekly

    @field_validator("job_type")
    @classmethod
    def validate_job_type(cls, v: str) -> str:
        if v not in ("daily", "weekly"):
            raise ValueError("job_type must be 'daily' or 'weekly'")
        return v


class JobRunOut(BaseModel):
    id: int
    competitor_id: Optional[int] = None
    job_type: str
    status: str
    triggered_by: Optional[str] = None
    started_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Digests
# ---------------------------------------------------------------------------

class DigestOut(BaseModel):
    id: int
    job_run_id: int
    competitor_id: int
    period: str
    digest_date: str
    digest: dict[str, Any]
    created_at: str


# Forward reference resolution
CompetitorOut.model_rebuild()
