using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.PostgreSql;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Ngre një PostgreSQL REAL në Docker (Testcontainers) + API-n në memorie.
/// PostgreSQL real është i domosdoshëm — testi i double-booking mbështetet
/// në exclusion constraint-in që nuk ekziston në InMemory/SQLite.
/// </summary>
public class BookingApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string SuperAdminPassword = "Test123!SuperAdmin";
    public const string DefaultUserPassword = "Test123!Booking";

    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        _ = Server; // forcon ndërtimin e host-it (migrations + seed) para testit të parë
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        // Me minimal hosting, ConfigureAppConfiguration i factory-t aplikohet PASI
        // Program.cs i ka lexuar vlerat (rate limiter, JWT) — prandaj env vars:
        // WebApplicationBuilder i lexon ato MBI appsettings që në krijim.
        SetConfig("ConnectionStrings__BookingDb", _postgres.GetConnectionString());
        SetConfig("Jwt__Secret", "TEST-sekret-vetem-per-teste-integrimit-1234567890");
        SetConfig("Auth__RequireConfirmedEmail", "false");
        SetConfig("Database__ApplyMigrationsOnStartup", "true");
        SetConfig("Seed__Enabled", "true");
        SetConfig("Seed__SuperAdminPassword", SuperAdminPassword);
        SetConfig("Seed__DefaultUserPassword", DefaultUserPassword);
        SetConfig("RateLimiting__AuthPermitLimit", "1000");
        SetConfig("RateLimiting__BookingPermitLimit", "1000");
    }

    private static void SetConfig(string key, string value) =>
        Environment.SetEnvironmentVariable(key, value);
}

/// <summary>Një container + një host për të gjitha klasat e testeve — shpejtësi dhe seed i përbashkët.</summary>
[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<BookingApiFactory>;
