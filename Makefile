.PHONY: dev down logs api-test api-lint web-lint

dev:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

api-test:
	docker compose run --rm api pytest

api-lint:
	docker compose run --rm api ruff check .

web-lint:
	docker compose run --rm web npm run lint
