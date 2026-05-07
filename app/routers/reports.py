from fastapi import APIRouter, Depends
from typing import Optional

from auth.google_oauth import get_current_user
from db import database as db

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("")
async def get_reports(
    category: str = "all",
    competitor_id: Optional[int] = None,
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    """
    Return a flat list of report items extracted from recent digests.

    category: all | news | web | social
    competitor_id: filter to a single competitor (optional)
    days: how many days back to look (default 30)
    """
    return await db.get_report_items(
        category=category,
        competitor_id=competitor_id,
        days=days,
    )
