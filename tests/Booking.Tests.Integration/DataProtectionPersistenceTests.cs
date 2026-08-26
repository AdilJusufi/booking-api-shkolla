using Booking.Infrastructure;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Key ring-u i Data Protection duhet të mbijetojë rinisjen e container-it.
///
/// Një "rinisje" këtu simulohet duke ndërtuar një ServiceProvider krejt të ri kundrejt
/// TË NJËJTËS databazë dhe duke e hedhur poshtë të parin — pikërisht ajo që ndodh në
/// Render kur container-i vdes dhe ngrihet prapë mbi Postgres-in e Neon-it.
///
/// Testi qendror nuk mjaftohet me "a ka rresht në tabelë": ai gjeneron një token të vërtetë
/// Identity para rinisjes dhe e KONSUMON pas saj, sepse ajo është sjellja që preket
/// realisht nga humbja e çelësave (linku i rivendosjes së fjalëkalimit në email).
/// </summary>
public class DataProtectionPersistenceTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();

        // Migrations njëherë — të dy "container-at" e mëpasëm gjejnë skemën gati,
        // ashtu si në prodhim ku Database__ApplyMigrationsOnStartup e ka aplikuar.
        await using var provider = BuildProvider();
        using var scope = provider.CreateScope();
        await scope.ServiceProvider.GetRequiredService<BookingDbContext>().Database.MigrateAsync();
    }

    public async Task DisposeAsync() => await _postgres.DisposeAsync();

    [Fact]
    public async Task PasswordResetToken_IssuedBeforeRestart_StillWorksAfterRestart()
    {
        var email = $"reset-{Guid.NewGuid():N}@test.dev";
        string token;

        // --- Container-i #1: useri kërkon rivendosje fjalëkalimi, token-i shkon me email ---
        await using (var before = BuildProvider())
        {
            using var scope = before.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            await CreateUserAsync(users, email);

            var user = await users.FindByEmailAsync(email);
            token = await users.GeneratePasswordResetTokenAsync(user!);
        }

        // --- Container-i #2: useri klikon linkun pasi container-i është rinisur ---
        await using (var after = BuildProvider())
        {
            using var scope = after.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);

            var result = await users.ResetPasswordAsync(user!, token, "Fjalekalim1!");

            result.Succeeded.Should().BeTrue(
                "token-i i rivendosjes duhet të mbetet i vlefshëm pas rinisjes së container-it; " +
                "dështimi këtu do të thotë se key ring-u u rigjenerua. Gabimet: {0}",
                string.Join(", ", result.Errors.Select(e => e.Description)));
        }
    }

    [Fact]
    public async Task EmailConfirmationToken_IssuedBeforeRestart_StillWorksAfterRestart()
    {
        // Auth:RequireConfirmedEmail është true në prodhim — nëse ky token bie,
        // useri i ri nuk e konfirmon dot llogarinë kurrë.
        var email = $"konfirmim-{Guid.NewGuid():N}@test.dev";
        string token;

        await using (var before = BuildProvider())
        {
            using var scope = before.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            await CreateUserAsync(users, email);

            var user = await users.FindByEmailAsync(email);
            token = await users.GenerateEmailConfirmationTokenAsync(user!);
        }

        await using (var after = BuildProvider())
        {
            using var scope = after.CreateScope();
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = await users.FindByEmailAsync(email);

            var result = await users.ConfirmEmailAsync(user!, token);

            result.Succeeded.Should().BeTrue(
                "token-i i konfirmimit duhet të mbijetojë rinisjen. Gabimet: {0}",
                string.Join(", ", result.Errors.Select(e => e.Description)));
        }
    }

    [Fact]
    public async Task KeyRing_IsReadBackFromDatabase_NotRegeneratedOnRestart()
    {
        await using (var before = BuildProvider())
        {
            // Krijimi i çelësit është dembel — protect-i i parë e detyron.
            before.GetRequiredService<IDataProtectionProvider>()
                .CreateProtector("test").Protect("x");
        }

        int keysAfterFirstStart = await CountKeysAsync();
        keysAfterFirstStart.Should().BeGreaterThan(0, "çelësi duhet të ketë shkuar në databazë, jo në disk");

        await using (var after = BuildProvider())
        {
            after.GetRequiredService<IDataProtectionProvider>()
                .CreateProtector("test").Protect("y");
        }

        (await CountKeysAsync()).Should().Be(keysAfterFirstStart,
            "rinisja duhet ta lexojë key ring-un ekzistues, jo të shtojë çelës të ri");
    }

    [Fact]
    public async Task Token_DoesNotSurviveRestart_WhenKeysStayOnEphemeralDisk()
    {
        // Kontroll negativ: riprodhon sjelljen E VJETËR (çelësat në filesystem-in e
        // container-it, i cili humb në rinisje). Pa këtë, testet e mësipërme mund të
        // kalonin edhe sikur asgjë të mos ruhej vërtet — ky provon se ato kapin rregresionin.
        var diskOfContainer1 = Directory.CreateTempSubdirectory();
        var diskOfContainer2 = Directory.CreateTempSubdirectory();

        try
        {
            var email = $"efemer-{Guid.NewGuid():N}@test.dev";
            string token;

            await using (var before = BuildProvider(keysOnDisk: diskOfContainer1))
            {
                using var scope = before.CreateScope();
                var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
                await CreateUserAsync(users, email);

                var user = await users.FindByEmailAsync(email);
                token = await users.GeneratePasswordResetTokenAsync(user!);
            }

            await using (var after = BuildProvider(keysOnDisk: diskOfContainer2))
            {
                using var scope = after.CreateScope();
                var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
                var user = await users.FindByEmailAsync(email);

                var result = await users.ResetPasswordAsync(user!, token, "Fjalekalim1!");

                result.Succeeded.Should().BeFalse(
                    "me çelësat në disk efemer, token-i i lëshuar para rinisjes duhet të refuzohet — " +
                    "pikërisht bug-u që ruajtja në databazë e zgjidh");
            }
        }
        finally
        {
            diskOfContainer1.Delete(recursive: true);
            diskOfContainer2.Delete(recursive: true);
        }
    }

    private async Task<int> CountKeysAsync()
    {
        await using var provider = BuildProvider();
        using var scope = provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<BookingDbContext>()
            .DataProtectionKeys.CountAsync();
    }

    private static async Task CreateUserAsync(UserManager<ApplicationUser> users, string email)
    {
        var result = await users.CreateAsync(
            new ApplicationUser
            {
                UserName = email,
                Email = email,
                FirstName = "Testi",
                LastName = "Testues"
            },
            "Fjalekalim0!");

        result.Succeeded.Should().BeTrue(string.Join(", ", result.Errors.Select(e => e.Description)));
    }

    /// <summary>
    /// Një "container" i ri: ServiceProvider i pavarur mbi të njëjtën databazë.
    /// Konfigurimi jepet in-memory qëllimisht — BookingApiFactory i vendos disa
    /// çelësa si env vars të procesit, dhe këtu nuk duam t'i trashëgojmë.
    /// </summary>
    /// <param name="keysOnDisk">
    /// Kur jepet, çelësat ruhen në këtë dosje në vend të databazës — përdoret vetëm
    /// nga kontrolli negativ për të imituar filesystem-in efemer të container-it.
    /// </param>
    private ServiceProvider BuildProvider(DirectoryInfo? keysOnDisk = null)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:BookingDb"] = _postgres.GetConnectionString(),
                ["Jwt:Secret"] = "TEST-sekret-vetem-per-teste-integrimit-1234567890",
                ["Jwt:Issuer"] = "booking-api",
                ["Jwt:Audience"] = "booking-api-clients"
            })
            .Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(configuration);

        if (keysOnDisk is not null)
        {
            // Regjistrimi i fundit fiton mbi PersistKeysToDbContext të AddInfrastructure.
            services.AddDataProtection()
                .SetApplicationName("Booking.Api")
                .PersistKeysToFileSystem(keysOnDisk);
        }

        return services.BuildServiceProvider();
    }
}
