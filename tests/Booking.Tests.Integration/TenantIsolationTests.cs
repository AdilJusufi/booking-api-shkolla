using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

[Collection("api")]
public class TenantIsolationTests
{
    private readonly BookingApiFactory _factory;

    public TenantIsolationTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private static UpdateClinicRequest UpdateRequest(string name) => new()
    {
        Name = name,
        Description = "Përditësim testi",
        PhoneNumber = "+383 44 999 999",
        Email = null,
        Website = null
    };

    [Fact]
    public async Task ClinicAdmin_CannotUpdateForeignClinic()
    {
        // Admini i seed-uar menaxhon vetëm Klinikën Dardania — jo Sunny.
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);
        client.WithToken(auth.AccessToken);

        var response = await client.PutAsJsonAsync(
            $"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}",
            UpdateRequest("Tentim hakerimi"), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ClinicAdmin_CanUpdateOwnClinic()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);
        client.WithToken(auth.AccessToken);

        var response = await client.PutAsJsonAsync(
            $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}",
            UpdateRequest("Klinika Dentare Dardania"), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Patient_CannotAccessAdminEndpoints()
    {
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client)).AccessToken);

        var response = await client.GetAsync("/api/admin/clinics");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task SuperAdmin_SeesAuditLogs()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword);
        client.WithToken(auth.AccessToken);

        var response = await client.GetAsync("/api/admin/audit-logs");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
