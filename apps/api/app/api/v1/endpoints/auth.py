from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_principal
from app.db.session import get_db
from app.schemas.auth import LoginRequest, RefreshRequest, SignUpRequest, TokenPair
from app.schemas.principal import Principal
from app.services.auth import authenticate, register, rotate_refresh_token

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def sign_up(payload: SignUpRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    return await register(db, payload)


@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    return await authenticate(db, payload)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    return await rotate_refresh_token(db, payload.refresh_token)


@router.get("/me", response_model=Principal)
async def me(principal: Principal = Depends(get_principal)) -> Principal:
    return principal
