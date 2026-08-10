from sqlalchemy import pool

from app.db.session import database_engine_options, normalize_database_url


def test_supabase_pooler_url_disables_asyncpg_statement_caches() -> None:
    url = (
        "postgresql+asyncpg://postgres.example:password"
        "@aws-0-us-east-2.pooler.supabase.com:6543/postgres"
    )

    normalized = normalize_database_url(url)

    assert "prepared_statement_cache_size=0" in normalized
    assert "statement_cache_size=0" in normalized


def test_supabase_pooler_engine_options_use_unique_statement_names_and_null_pool() -> None:
    url = (
        "postgresql+asyncpg://postgres.example:password"
        "@aws-0-us-east-2.pooler.supabase.com:6543/postgres"
    )

    options = database_engine_options(url)

    assert options["poolclass"] is pool.NullPool
    connect_args = options["connect_args"]
    assert connect_args["statement_cache_size"] == 0
    first_name = connect_args["prepared_statement_name_func"]()
    second_name = connect_args["prepared_statement_name_func"]()
    assert first_name.startswith("__asyncpg_")
    assert second_name.startswith("__asyncpg_")
    assert first_name != second_name
