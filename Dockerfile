# ---------- Faza e build-it ----------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Kopjohen vetëm csproj-t fillimisht — layer caching për restore.
COPY Booking.sln Directory.Build.props ./
COPY src/Booking.Domain/Booking.Domain.csproj src/Booking.Domain/
COPY src/Booking.Application/Booking.Application.csproj src/Booking.Application/
COPY src/Booking.Infrastructure/Booking.Infrastructure.csproj src/Booking.Infrastructure/
COPY src/Booking.Api/Booking.Api.csproj src/Booking.Api/
RUN dotnet restore src/Booking.Api/Booking.Api.csproj

COPY src/ src/
RUN dotnet publish src/Booking.Api/Booking.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---------- Faza e runtime-it ----------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl për healthcheck-un e container-it
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

# Run si user jo-root (siguri)
RUN useradd --create-home appuser
USER appuser

EXPOSE 8080
ENV ASPNETCORE_HTTP_PORTS=8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "Booking.Api.dll"]
