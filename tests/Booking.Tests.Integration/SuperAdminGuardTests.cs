using System.Net;
using Booking.Application.Common.Security;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>WR-12: një SuperAdmin s'çaktivizon dot veten, as SuperAdmin-in e fundit aktiv.</summary>
[Collection("api")]
public class SuperAdminGuardTests
{
    private readonly BookingApiFactory _factory;

    public SuperAdminGuardTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task SuperAdmin_CannotDeactivateThemselves()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword);
        client.WithToken(auth.AccessToken);

        var response = await client.PostAsync($"/api/admin/users/{auth.UserId}/deactivate", null);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await response.Content.ReadAsStringAsync()).Should().Contain("cannot-deactivate-self");
    }

    [Fact]
    public async Task LastActiveSuperAdmin_CannotBeDeactivated_ButAnotherOneCanWhileTwoRemain()
    {
        var second = await CreateSuperAdminAsync();
        var third = await CreateSuperAdminAsync();
        var seedId = await SetUserActiveDirectlyAsync(DbSeeder.SuperAdminEmail, false);
        try
        {
            var client = _factory.CreateClient();
            client.WithToken((await TestHelpers.LoginAsync(client, second.Email, BookingApiFactory.SuperAdminPassword)).AccessToken);

            // Aktivë: second + third → third mund të çaktivizohet.
            (await client.PostAsync($"/api/admin/users/{third.Id}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

            // Tani second është i vetmi aktiv; një SuperAdmin tjetër (third, i riaktivizuar
            // direkt) s'mund ta çaktivizojë atë.
            await SetUserActiveDirectlyAsync(third.Email, true);
            await SetUserActiveDirectlyAsync(second.Email, true);
            var thirdClient = _factory.CreateClient();
            thirdClient.WithToken((await TestHelpers.LoginAsync(thirdClient, third.Email, BookingApiFactory.SuperAdminPassword)).AccessToken);
            await SetUserActiveDirectlyAsync(third.Email, false);

            var refused = await thirdClient.PostAsync($"/api/admin/users/{second.Id}/deactivate", null);
            refused.StatusCode.Should().Be(HttpStatusCode.Conflict);
            (await refused.Content.ReadAsStringAsync()).Should().Contain("last-superadmin");
        }
        finally
        {
            await SetUserActiveDirectlyAsync(DbSeeder.SuperAdminEmail, true);
            _ = seedId;
        }
    }

    private async Task<(Guid Id, string Email)> CreateSuperAdminAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var email = $"sa-{Guid.NewGuid():N}@test.dev";
        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            FirstName = "Super",
            LastName = "Testi",
            CreatedAt = DateTime.UtcNow
        };
        (await users.CreateAsync(user, BookingApiFactory.SuperAdminPassword)).Succeeded.Should().BeTrue();
        (await users.AddToRoleAsync(user, Roles.SuperAdmin)).Succeeded.Should().BeTrue();
        return (user.Id, email);
    }

    private async Task<Guid> SetUserActiveDirectlyAsync(string email, bool isActive)
    {
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await users.FindByEmailAsync(email);
        user!.IsActive = isActive;
        await users.UpdateAsync(user);
        return user.Id;
    }
}
