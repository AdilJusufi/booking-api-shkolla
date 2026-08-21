using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Booking.Application.Features.Auth;
using Booking.Infrastructure.Auth;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
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
        await AssertErrorAsync(response, "invalid_credentials", "Kredencialet janë të pavlefshme.");
    }

    [Fact]
    public async Task Login_LockedOutAccount_Returns401WithAccountLockedCode()
    {
        var client = _factory.CreateClient();
        var email = $"i-bllokuar-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        // 5 tentime të dështuara = pragu i lockout-it (shih DependencyInjection.cs).
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var failed = await client.PostAsJsonAsync("/api/auth/login",
                new LoginRequest(email, "PasswordIGabuar1"), TestHelpers.Json);
            failed.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        // Edhe me password-in e saktë llogaria mbetet e bllokuar.
        var response = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest(email, BookingApiFactory.DefaultUserPassword), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        await AssertErrorAsync(response, "account_locked",
            "Llogaria është bllokuar përkohësisht nga tentimet e dështuara. Provo më vonë.");
    }

    [Fact]
    public async Task Login_UnconfirmedEmail_Returns401WithEmailNotConfirmedCode()
    {
        var client = _factory.CreateClient();
        var email = $"i-pakonfirmuar-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        // Fabrika e ngre hostin me RequireConfirmedEmail=false; e ndezim vetëm për këtë test.
        // Testet e koleksionit "api" nuk ekzekutohen paralelisht, prandaj s'ka garë.
        var authSettings = _factory.Services.GetRequiredService<IOptions<AuthSettings>>().Value;
        authSettings.RequireConfirmedEmail = true;
        try
        {
            var response = await client.PostAsJsonAsync("/api/auth/login",
                new LoginRequest(email, BookingApiFactory.DefaultUserPassword), TestHelpers.Json);

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            await AssertErrorAsync(response, "email_not_confirmed",
                "Email-i nuk është konfirmuar ende. Kontrollo postën tënde.");
        }
        finally
        {
            authSettings.RequireConfirmedEmail = false;
        }
    }

    [Fact]
    public async Task Login_DeactivatedAccount_Returns403AndWorksAgainAfterReactivation()
    {
        var client = _factory.CreateClient();
        var email = $"i-caktivizuar-{Guid.NewGuid():N}@test.dev";
        var auth = await TestHelpers.RegisterPatientAsync(client, email);

        var superAdmin = _factory.CreateClient();
        var superAdminAuth = await TestHelpers.LoginAsync(
            superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword);
        superAdmin.WithToken(superAdminAuth.AccessToken);

        var deactivate = await superAdmin.PostAsync($"/api/admin/users/{auth.UserId}/deactivate", null);
        deactivate.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 403, jo 401: kredencialet janë të sakta — llogaria është e çaktivizuar.
        var blocked = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest(email, BookingApiFactory.DefaultUserPassword), TestHelpers.Json);

        blocked.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        await AssertErrorAsync(blocked, "account_deactivated",
            "Llogaria juaj është çaktivizuar. Kontaktoni mbështetjen.");

        var activate = await superAdmin.PostAsync($"/api/admin/users/{auth.UserId}/activate", null);
        activate.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var reloggedIn = await TestHelpers.LoginAsync(client, email, BookingApiFactory.DefaultUserPassword);
        reloggedIn.AccessToken.Should().NotBeNullOrEmpty();
    }

    /// <summary>Verifikon kontratën e gabimit: `code`, `type` dhe teksti i pandryshuar i `detail`.</summary>
    private static async Task AssertErrorAsync(HttpResponseMessage response, string expectedCode, string expectedDetail)
    {
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestHelpers.Json);

        problem.GetProperty("code").GetString().Should().Be(expectedCode);
        problem.GetProperty("type").GetString().Should().EndWith($"/{expectedCode}");
        problem.GetProperty("detail").GetString().Should().Be(expectedDetail);
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
