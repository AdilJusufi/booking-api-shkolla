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
    public void Allows_seeding_outside_development_only_when_explicitly_opted_in()
    {
        var act = () => EnvironmentGuard.Validate("Production", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Seed:Enabled", "true"),
            ("Seed:AllowOutsideDevelopment", "true")));

        act.Should().NotThrow();
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

    [Theory]
    [InlineData("Seed:SuperAdminPassword", "Dev123!SuperAdmin")]
    [InlineData("Seed:DefaultUserPassword", "Dev123!Booking")]
    public void Refuses_to_boot_when_a_seed_password_is_a_public_repo_value_outside_development(
        string key, string repoPassword)
    {
        // Prodhim pa opt-in: një password i marrë nga repo-ja duhet ta ndalë nisjen.
        var act = () => EnvironmentGuard.Validate("Production", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Seed:Enabled", "false"),
            (key, repoPassword)));

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*NISJA U NDAL*")
            .WithMessage($"*{key.Replace(":", "__")}*");
    }

    [Fact]
    public void Refuses_to_boot_on_a_public_repo_seed_password_even_when_seeding_is_disabled()
    {
        // Pavarësisht Seed:Enabled: një password publik i lënë në konfigurim është minë.
        var act = () => EnvironmentGuard.Validate("Production", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Seed:Enabled", "false"),
            ("Seed:SuperAdminPassword", "Dev123!SuperAdmin")));

        act.Should().Throw<InvalidOperationException>().WithMessage("*NISJA U NDAL*");
    }

    [Fact]
    public void Allows_seeding_outside_development_with_unique_non_public_passwords()
    {
        var act = () => EnvironmentGuard.Validate("Production", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Seed:Enabled", "true"),
            ("Seed:AllowOutsideDevelopment", "true"),
            ("Seed:SuperAdminPassword", "a-unique-not-in-repo-secret-01"),
            ("Seed:DefaultUserPassword", "another-unique-not-in-repo-02")));

        act.Should().NotThrow();
    }

    [Fact]
    public void Allows_the_public_repo_seed_passwords_inside_development()
    {
        // Brenda Development-it vlerat e repo-s janë pikërisht ato që priten (DB lokale).
        var act = () => EnvironmentGuard.Validate("Development", Config(
            ("ConnectionStrings:BookingDb", "Host=localhost;Port=5433;Database=booking"),
            ("Seed:Enabled", "true"),
            ("Seed:SuperAdminPassword", "Dev123!SuperAdmin"),
            ("Seed:DefaultUserPassword", "Dev123!Booking")));

        act.Should().NotThrow();
    }

    [Fact]
    public void Allows_the_public_repo_seed_passwords_on_an_explicit_dev_instance_outside_development()
    {
        // Seed__AllowOutsideDevelopment=true = instancë dev e hedhshme: vlerat e repo-s lejohen.
        var act = () => EnvironmentGuard.Validate("Production", Config(
            ("ConnectionStrings:BookingDb", "Host=ep-x.aws.neon.tech;Database=booking"),
            ("Seed:Enabled", "true"),
            ("Seed:AllowOutsideDevelopment", "true"),
            ("Seed:SuperAdminPassword", "Dev123!SuperAdmin"),
            ("Seed:DefaultUserPassword", "Dev123!Booking")));

        act.Should().NotThrow();
    }
}
