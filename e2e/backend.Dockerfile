FROM python:3.11.14-slim-bookworm
WORKDIR /app
COPY requirements.txt /tmp/requirements.txt
# Existing passlib 1.7 requires bcrypt's pre-4.1 API.
RUN --mount=type=secret,id=build_ca if [ -s /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; printf 'bcrypt==4.0.1\n' > /tmp/constraints.txt && pip install --no-cache-dir -r /tmp/requirements.txt -c /tmp/constraints.txt
COPY . /app
RUN mkdir -p /app/uploads
