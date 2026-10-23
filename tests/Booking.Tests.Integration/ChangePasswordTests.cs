using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Auth;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Pjesa 3a: çdo rol e ndryshon fjalëkalimin vetë; pajisjet e tjera dalin, sesioni
/// aktual mbetet; fjalëkalimi aktual i gabuar kthen kodin e zakonshëm.
/// </summary>
[Collection("api")]
public class ChangePasswordTests
{
    private const string NewPassword = "Ndryshuar1!Qa";
    private readonly BookingApiFactory _factory;

    public ChangePasswordTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Doctor_CanChangePassword_OtherDevicesAreSignedOut_CurrentSessionStays()
    {
        var email = await CreateDoctorAsync();
        var anon = _factory.CreateClient();
        var deviceA = await TestHelpers.LoginAsync(anon, email, BookingApiFactory.DefaultUserPassword);
        var deviceB = await TestHelpers.LoginAsync(anon, email, BookingApiFactory.DefaultUserPassword);

        var client = _factory.CreateClient().WithToken(deviceA.AccessToken);
        var response = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(BookingApiFactory.DefaultUserPassword, NewPassword, deviceA.RefreshToken), TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // Sesioni aktual kontrollohet i pari: paraqitja e një token-i të revokuar (B) aktivizon
        // mbrojtjen nga ripërdorimi, e cila me qëllim mbyll gjithçka.
        (await anon.PostAsJsonAsync("/api/auth/refresh-token", new RefreshTokenRequest(deviceA.RefreshToken), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.OK, "sesioni që e bëri ndryshimin mbetet");
        (await anon.PostAsJsonAsync("/api/auth/refresh-token", new RefreshTokenRequest(deviceB.RefreshToken), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.Unauthorized, "pajisja tjetër del menjëherë");

        (await anon.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, NewPassword), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task WrongCurrentPassword_IsRefused_WithPasswordMismatchCode()
    {
        var email = await CreateDoctorAsync();
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.LoginAsync(client, email, BookingApiFactory.DefaultUserPassword)).AccessToken);

        var response = await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest("Gabim123!", NewPassword), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await response.Content.ReadAsStringAsync()).Should().Contain("PasswordMismatch");
    }

    [Fact]
    public async Task ClinicAdmin_CanChangePassword()
    {
        // Admin i ri (jo ai i seed-uar, që testet e tjera e përdorin me fjalëkalimin e njohur).
        var email = $"admin-pw-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(_factory.CreateClient(), email);
        var superAdmin = _factory.CreateClient();
        superAdmin.WithToken((await TestHelpers.LoginAsync(superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword)).AccessToken);
        await superAdmin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}/admins",
            new AssignClinicAdminRequest { Email = email }, TestHelpers.Json);

        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.LoginAsync(client, email, BookingApiFactory.DefaultUserPassword)).AccessToken);

        (await client.PostAsJsonAsync("/api/auth/change-password",
            new ChangePasswordRequest(BookingApiFactory.DefaultUserPassword, NewPassword), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    private async Task<string> CreateDoctorAsync()
    {
        var admin = _factory.CreateClient();
        admin.WithToken((await TestHelpers.LoginAsync(admin, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);
        var email = $"doktor-pw-{Guid.NewGuid():N}@test.dev";
        var created = await admin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors", new CreateDoctorRequest
        {
            FirstName = "Fjalë",
            LastName = "Kalimi",
            Email = email,
            PhoneNumber = "+383 44 444 000",
            InitialPassword = BookingApiFactory.DefaultUserPassword,
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            YearsOfExperience = 1,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyDentist],
            BranchIds = [DbSeeder.Ids.BranchDardania],
            ServiceIds = []
        }, TestHelpers.Json);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        return email;
    }
}
