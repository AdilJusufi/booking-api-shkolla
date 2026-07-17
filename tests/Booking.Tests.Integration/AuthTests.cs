using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Auth;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

[Collection("api")]
public class AuthTests
{
    private readonly BookingApiFactory _factory;

    public AuthTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Register_NewPatient_Returns201WithTokens()
    {
        var client = _factory.CreateClient();

        var auth = await TestHelpers.RegisterPatientAsync(client);

        auth.AccessToken.Should().NotBeNullOrEmpty();
        auth.RefreshToken.Should().NotBeNullOrEmpty();
        auth.Roles.Should().Contain("Patient");
    }

    [Fact]
    public async Task Register_DuplicateEmail_Returns409()
    {
        var client = _factory.CreateClient();
        var email = $"dublikat-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "Testi", "Dublikati", email, "+383 44 000 001", BookingApiFactory.DefaultUserPassword,
            new DateOnly(1990, 1, 1), Booking.Domain.Enums.Gender.Male, null, null), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Register_WeakPassword_Returns422()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            "Testi", "Dobëti", $"dobet-{Guid.NewGuid():N}@test.dev", "+383 44 000 002", "dobet",
            new DateOnly(1990, 1, 1), Booking.Domain.Enums.Gender.Male, null, null), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Login_SeededPatient_Succeeds()
    {
        var client = _factory.CreateClient();

        var auth = await TestHelpers.LoginAsync(client, DbSeeder.PatientEmail, BookingApiFactory.DefaultUserPassword);

        auth.Roles.Should().Contain("Patient");
    }

    [Fact]
    public async Task Login_WrongPassword_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest(DbSeeder.PatientEmail, "PasswordIGabuar1"), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task RefreshToken_Rotation_OldTokenBecomesInvalid()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.RegisterPatientAsync(client);

        // Rotacioni i parë funksionon.
        var refreshResponse = await client.PostAsJsonAsync("/api/auth/refresh-token",
            new RefreshTokenRequest(auth.RefreshToken), TestHelpers.Json);
        refreshResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        // Ripërdorimi i token-it të vjetër (të rotuar) refuzohet.
        var reuseResponse = await client.PostAsJsonAsync("/api/auth/refresh-token",
            new RefreshTokenRequest(auth.RefreshToken), TestHelpers.Json);
        reuseResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithoutToken_Returns401()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/appointments/my");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
