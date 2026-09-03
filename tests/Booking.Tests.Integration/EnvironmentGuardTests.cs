using Booking.Api.Startup;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Logjikë e pastër — pa databazë, pa container, pa fixture. Jeton në këtë projekt vetëm
/// sepse ky është i vetmi që referon Booking.Api.
/// </summary>
public class EnvironmentGuardTests
{
    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build();

    [Theory]
    [InlineData("Host=localhost;Database=booking")]
    [InlineData("Host=127.0.0.1;Port=5433;Database=booking")]
    [InlineData("Host=127.0.0.5;Database=booking")]          // gjithë 127.0.0.0/8
    [InlineData("Host=::1;Database=booking")]
    [InlineData("Host=[::1]:5432;Database=booking")]
    [InlineData("Host=LOCALHOST;Database=booking")]           // pa dallim shkronjash
    [InlineData("Host=localhost:5433;Database=booking")]
    [InlineData("Database=booking")]                          // pa host → Npgsql bie te localhost
    public void Recognises_loopback_connection_strings(string connectionString)
    {
        EnvironmentGuard.PointsAtLoopback(connectionString).Should().BeTrue();
    }

    [Theory]
    [InlineData("Host=ep-x.eu-central-1.aws.neon.tech;Database=booking")]
    [InlineData("Host=10.0.0.4;Database=booking")]
    [InlineData("Host=db.internal;Database=booking")]
    // Kurthi i nënvargut, në të dyja drejtimet: një kontroll Contains("localhost") do t'i
    // kalonte të dyja këto si të sigurta.
    [InlineData("Host=localhost-replica.example.com;Database=booking")]
    [InlineData("Host=prod.example.com;ApplicationName=localhost")]
    // Failover me shumë host-e: një i vetëm jo-lokal e prish garancinë.
    [InlineData("Host=localhost,prod.example.com;Database=booking")]
    public void Rejects_non_loopback_connection_strings(string connectionString)
    {
        EnvironmentGuard.PointsAtLoopback(connectionString).Should().BeFalse();
    }

    [Fact]
    public void Refuses_to_boot_when_development_points_at_a_remote_database()
    {
        var act = () => EnvironmentGuard.Validate("Development",
            Config(("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking")));

        act.Should().Throw<InvalidOperationException>().WithMessage("*NISJA U NDAL*");
    }

    [Fact]
    public void Allows_development_against_a_remote_database_only_when_explicitly_opted_in()
    {
        var act = () => EnvironmentGuard.Validate("Development", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Development:AllowRemoteDatabase", "true")));

        act.Should().NotThrow();
    }

    [Fact]
    public void Refuses_to_boot_when_seeding_is_enabled_outside_development()
    {
        var act = () => EnvironmentGuard.Validate("Production", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Seed:Enabled", "true")));

        act.Should().Throw<InvalidOperationException>().WithMessage("*Seed:Enabled*");
    }

    [Fact]
    public void Allows_normal_development_startup()
    {
        var act = () => EnvironmentGuard.Validate("Development",
            Config(("ConnectionStrings:BookingDb", "Host=localhost;Port=5433;Database=booking"),
                   ("Seed:Enabled", "true")));

        act.Should().NotThrow();
    }

    [Fact]
    public void Allows_normal_production_startup()
    {
        var act = () => EnvironmentGuard.Validate("Production",
            Config(("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
                   ("Seed:Enabled", "false")));

        act.Should().NotThrow();
    }
}
