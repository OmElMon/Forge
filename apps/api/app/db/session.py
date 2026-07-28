import re
from collections.abc import AsyncIterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

INVALID_PERCENT_ENCODING = re.compile(r"%(?![0-9A-Fa-f]{2})")


def normalize_database_url(database_url: str) -> str:
    if INVALID_PERCENT_ENCODING.search(database_url):
        raise ValueError(
            "DATABASE_URL contains an unescaped percent sign. "
            "Use an alphanumeric database password, or URL-encode special characters."
        )

    if "pooler.supabase.com" not in database_url or "prepared_statement_cache_size" in database_url:
        return database_url

    parts = urlsplit(database_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["prepared_statement_cache_size"] = "0"
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


engine = create_async_engine(normalize_database_url(settings.database_url), pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
