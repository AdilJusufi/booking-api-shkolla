using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Auth;
using Booking.Domain.Enums;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Kufijtë e abuzimit (IEmailAbuseGuard) mbulojnë forgot-password DHE resend-confirmation
/// njësoj — shih AuthService. Testet përdorin ManualClock për të "kaluar kohë" pa pritur
/// realisht cooldown-in/ditën, dhe adresa unike (Guid) mes testesh që s'testojnë
/// eksplicitisht kryqëzimin e limitit, që teste të ndryshme mos të ndikojnë njëra-tjetrën
/// përmes tavanit GLOBAL, i cili numëron të gjitha adresat bashkë.
/// </summary>
[Collection("api")]
public class EmailAbuseLimitsTests
{
    private static readonly Regex LinkRegex = new(@"https?://\S*/(?:konfirmo-email|rivendos-fjalekalimin)\?\S+");

    private readonly BookingApiFactory _factory;

    public EmailAbuseLimitsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    // ---------- Resend-confirmation: sjellja bazë ----------

    [Fact]
    public async Task ResendConfirmation_Unconfirmed_NewTokenActuallyWorks()
    {
        var client = _factory.CreateClient();
        var email = $"ridergo-punon-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        var response = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var inbox = await DevEmailsAsync(client, email);
        var resendEmail = inbox.First(e => e.Subject.Contains("Konfirmo"));
        var (token, linkEmail) = ExtractTokenAndEmail(resendEmail.TextBody);
        linkEmail.Should().Be(email);

        var confirmResponse = await client.PostAsJsonAsync(
            "/api/auth/confirm-email", new ConfirmEmailRequest(email, token), TestHelpers.Json);
        confirmResponse.StatusCode.Should().Be(HttpStatusCode.NoContent,
            "tokeni i ridërguar duhet të jetë funksional, jo thjesht i pranishëm në email");
    }

    [Fact]
    public async Task ResendConfirmation_UnknownAddress_AlreadyConfirmed_AndSuccess_AllReturnIdenticalResponse()
    {
        var client = _factory.CreateClient();

        // E konfirmuar tashmë.
        var confirmedEmail = $"ridergo-konfirmuar-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, confirmedEmail);
        var firstInbox = await DevEmailsAsync(client, confirmedEmail);
        var (regToken, _) = ExtractTokenAndEmail(firstInbox.Single().TextBody);
        await client.PostAsJsonAsync("/api/auth/confirm-email", new ConfirmEmailRequest(confirmedEmail, regToken), TestHelpers.Json);

        var confirmedResponse = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(confirmedEmail), TestHelpers.Json);

        // E panjohur.
        var unknownResponse = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation",
            new ResendConfirmationRequest($"s'ekziston-{Guid.NewGuid():N}@test.dev"),
            TestHelpers.Json);

        // Sukses i vërtetë.
        var freshEmail = $"ridergo-i-fresket-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, freshEmail);
        var successResponse = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(freshEmail), TestHelpers.Json);

        confirmedResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
        unknownResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
        successResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var confirmedBody = await confirmedResponse.Content.ReadAsStringAsync();
        var unknownBody = await unknownResponse.Content.ReadAsStringAsync();
        var successBody = await successResponse.Content.ReadAsStringAsync();
        confirmedBody.Should().Be(unknownBody).And.Be(successBody).And.BeEmpty(
            "204 No Content nuk ka trup — të trija rastet duhet të jenë byte-për-byte identike");

        // Konfirmimi tashmë i konfirmuar s'duhet të ketë prodhuar email të ri.
        var confirmedInboxAfter = await DevEmailsAsync(client, confirmedEmail);
        confirmedInboxAfter.Should().HaveCount(1, "vetëm email-i origjinal i regjistrimit, asnjë ridërgim");
    }

    // ---------- Cooldown-i për-adresë: mbulon TË DYJA endpoint-et ----------

    [Fact]
    public async Task ResendConfirmation_SecondRequestWithinCooldown_SilentlyDropped_ButSameResponse()
    {
        await using var factory = WithManualClock(out var clock);
        var client = factory.CreateClient();
        var email = $"cooldown-konfirmim-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        var first = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
        var afterFirst = await DevEmailsAsync(client, email);

        // Ende brenda cooldown-it (parazgjedhja: 2 minuta) — ora "ecën" vetëm disa sekonda.
        clock.UtcNow = clock.UtcNow.AddSeconds(30);
        var second = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
        var afterSecond = await DevEmailsAsync(client, email);

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await first.Content.ReadAsStringAsync()).Should().Be(await second.Content.ReadAsStringAsync());

        afterSecond.Should().HaveCount(afterFirst.Count,
            "kërkesa e dytë brenda cooldown-it s'duhet të ketë prodhuar email shtesë");
    }

    [Fact]
    public async Task ForgotPassword_SecondRequestWithinCooldown_SilentlyDropped()
    {
        // E njëjta mbrojtje duhet të mbulojë forgot-password — jo vetëm resend-confirmation.
        await using var factory = WithManualClock(out var clock);
        var client = factory.CreateClient();
        var email = $"cooldown-rivendos-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        await client.PostAsJsonAsync("/api/auth/forgot-password", new ForgotPasswordRequest(email), TestHelpers.Json);
        var afterFirst = await DevEmailsAsync(client, email);

        clock.UtcNow = clock.UtcNow.AddSeconds(30);
        await client.PostAsJsonAsync("/api/auth/forgot-password", new ForgotPasswordRequest(email), TestHelpers.Json);
        var afterSecond = await DevEmailsAsync(client, email);

        afterSecond.Should().HaveCount(afterFirst.Count);
    }

    [Fact]
    public async Task Cooldown_IsSharedAcrossBothPurposes_ForTheSameAddress()
    {
        // Alternimi mes resend-confirmation dhe forgot-password për TË NJËJTËN adresë
        // s'duhet të dyfishojë buxhetin — të dy qëllimet ndajnë të njëjtin cooldown.
        await using var factory = WithManualClock(out var clock);
        var client = factory.CreateClient();
        var email = $"cooldown-i-perbashket-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        await client.PostAsJsonAsync("/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
        var afterResend = await DevEmailsAsync(client, email);

        clock.UtcNow = clock.UtcNow.AddSeconds(30);
        await client.PostAsJsonAsync("/api/auth/forgot-password", new ForgotPasswordRequest(email), TestHelpers.Json);
        var afterForgot = await DevEmailsAsync(client, email);

        afterForgot.Should().HaveCount(afterResend.Count,
            "forgot-password për të njëjtën adresë brenda cooldown-it të resend-confirmation duhet të refuzohet gjithashtu");
    }

    // ---------- Tavani ditor për-adresë ----------

    [Fact]
    public async Task PerAddressDailyLimit_BlocksAfterConfiguredCount()
    {
        const int limit = 3;
        await using var factory = WithManualClock(out var clock, perAddressDailyLimit: limit, perAddressCooldownMinutes: 0);
        var client = factory.CreateClient();
        var email = $"tavan-adrese-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, email);

        for (var i = 0; i < limit; i++)
        {
            clock.UtcNow = clock.UtcNow.AddMinutes(1);
            var response = await client.PostAsJsonAsync(
                "/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        }

        var afterLimit = await DevEmailsAsync(client, email);
        afterLimit.Should().HaveCount(limit + 1, "regjistrimi + tavani i plotë i ridërgimeve");

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var oneMore = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
        oneMore.StatusCode.Should().Be(HttpStatusCode.NoContent, "përgjigja mbetet e njëjtë edhe kur refuzohet");

        var afterOneMore = await DevEmailsAsync(client, email);
        afterOneMore.Should().HaveCount(afterLimit.Count, "tavani ditor për-adresë duhet ta ketë refuzuar këtë");
    }

    // ---------- Tavani për QËLLIM, mbi dritare rrëshqitëse ----------

    [Fact]
    public async Task PurposeWindowLimit_BlocksAfterConfiguredCount_AcrossDistinctAddresses()
    {
        // EmailSendAttempts ndahet me gjithë testet e tjera në këtë collection (i njëjti DB).
        // ManualClock zgjedh një datë rastësore, ndaj rreshtat e testeve të tjera bien
        // pothuajse gjithmonë jashtë kësaj dritareje — por numërohen gjithsesi, që testi të
        // mbetet korrekt edhe kur nuk bien.
        const int allowedMore = 2;
        var clock = new ManualClock();
        var existing = await CountAttemptsInWindowAsync(
            EmailSendPurpose.EmailConfirmation, clock.UtcNow.AddHours(-24));
        var limit = existing + allowedMore;

        await using var factory = WithManualClock(
            clock, purposeWindowLimit: (EmailSendPurpose.EmailConfirmation, limit));
        var client = factory.CreateClient();

        // Adresa TË NDRYSHME — asnjë s'e prek cooldown-in ose tavanin për-adresë të vetes,
        // kështu që vetëm tavani për-qëllim mund t'i bllokojë.
        for (var i = 0; i < allowedMore; i++)
        {
            var email = $"tavan-qellim-{i}-{Guid.NewGuid():N}@test.dev";
            await TestHelpers.RegisterPatientAsync(client, email);
            var response = await client.PostAsJsonAsync(
                "/api/auth/resend-confirmation", new ResendConfirmationRequest(email), TestHelpers.Json);
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            (await DevEmailsAsync(client, email)).Should().HaveCount(2, "regjistrimi + ridërgimi i lejuar");
        }

        var blockedEmail = $"tavan-qellim-blloku-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, blockedEmail);
        var blocked = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(blockedEmail), TestHelpers.Json);
        blocked.StatusCode.Should().Be(HttpStatusCode.NoContent, "përgjigja mbetet e njëjtë edhe nën tavan");

        (await DevEmailsAsync(client, blockedEmail)).Should().HaveCount(
            1, "vetëm regjistrimi — ridërgimi u refuzua nga tavani për-qëllim");
    }

    /// <summary>
    /// Vetë arsyeja e ndarjes sipas qëllimit, dhe skenari 8-adresësh nga rishikimi: më parë
    /// një numërues i vetëm i përbashkët do të thoshte se shterja e tij me ridërgime
    /// konfirmimi bllokonte NË HESHTJE rivendosjen e password-it për të gjithë përdoruesit.
    /// </summary>
    [Fact]
    public async Task ExhaustingOnePurpose_DoesNotStarveTheOther()
    {
        var clock = new ManualClock();
        var existingConfirmations = await CountAttemptsInWindowAsync(
            EmailSendPurpose.EmailConfirmation, clock.UtcNow.AddHours(-24));

        // Tavan i ngushtë vetëm për konfirmimet; PasswordReset mbetet me parazgjedhjen e vet.
        await using var factory = WithManualClock(
            clock, purposeWindowLimit: (EmailSendPurpose.EmailConfirmation, existingConfirmations + 1));
        var client = factory.CreateClient();

        // Shtere buxhetin e konfirmimeve.
        var firstEmail = $"shterje-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, firstEmail);
        await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(firstEmail), TestHelpers.Json);

        var starvedEmail = $"shterje-bllok-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, starvedEmail);
        await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(starvedEmail), TestHelpers.Json);
        (await DevEmailsAsync(client, starvedEmail)).Should().HaveCount(
            1, "buxheti i konfirmimeve duhet të jetë shterur tashmë");

        // Rivendosja e password-it duhet të mbetet krejt e paprekur — adresë tjetër, pra
        // as cooldown-i për-adresë nuk hyn në lojë.
        var resetEmail = $"rivendosje-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, resetEmail);
        var before = (await DevEmailsAsync(client, resetEmail)).Count;

        clock.UtcNow = clock.UtcNow.AddMinutes(5);
        var reset = await client.PostAsJsonAsync(
            "/api/auth/forgot-password", new ForgotPasswordRequest(resetEmail), TestHelpers.Json);
        reset.StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await DevEmailsAsync(client, resetEmail)).Should().HaveCount(
            before + 1,
            "rivendosja e password-it ka buxhetin e vet — shterja e konfirmimeve s'duhet ta prekë");
    }

    /// <summary>
    /// Dritarja rrëshqet, nuk pret mesnatën. Dritarja vendoset 2-orëshe dhe sahati çohet
    /// 3 orë përpara BRENDA së njëjtës ditë UTC (ManualClock nis në 08:00): me numërimin e
    /// vjetër kalendarik kjo do të mbetej ende e bllokuar, sepse dita s'ka ndryshuar.
    /// </summary>
    [Fact]
    public async Task RollingWindow_RecoversWithoutWaitingForMidnight()
    {
        var clock = new ManualClock();
        var existing = await CountAttemptsInWindowAsync(
            EmailSendPurpose.EmailConfirmation, clock.UtcNow.AddHours(-2));

        await using var factory = WithManualClock(
            clock,
            perAddressCooldownMinutes: 0,
            purposeWindowLimit: (EmailSendPurpose.EmailConfirmation, existing + 1),
            purposeWindowHours: 2);
        var client = factory.CreateClient();

        var firstEmail = $"dritare-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, firstEmail);
        await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(firstEmail), TestHelpers.Json);

        var blockedEmail = $"dritare-bllok-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(client, blockedEmail);
        await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(blockedEmail), TestHelpers.Json);
        (await DevEmailsAsync(client, blockedEmail)).Should().HaveCount(1, "tavani duhet ta ketë refuzuar");

        var startingDay = clock.UtcNow.Date;
        clock.UtcNow = clock.UtcNow.AddHours(3);
        clock.UtcNow.Date.Should().Be(startingDay, "testi provon rrëshqitjen, jo kalimin e mesnatës");

        var recovered = await client.PostAsJsonAsync(
            "/api/auth/resend-confirmation", new ResendConfirmationRequest(blockedEmail), TestHelpers.Json);
        recovered.StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await DevEmailsAsync(client, blockedEmail)).Should().HaveCount(
            2, "tentativat e vjetra dolën nga dritarja — kapaciteti u kthye pa pritur mesnatën");
    }

    // ---------- Ndihmësa ----------

    /// <summary>
    /// Krijon një factory të derivuar me IDateTimeProvider të kontrollueshëm (dhe,
    /// opsionalisht, limite më të vogla se parazgjedhja) — pa ndikuar mbi collection
    /// fixture-in e përbashkët, i cili s'e ka ManualClock dhe s'duhet t'i ndryshohen numrat.
    /// </summary>
    private WebApplicationFactory<Program> WithManualClock(
        out ManualClock clock, int? perAddressDailyLimit = null, int? perAddressCooldownMinutes = null,
        (EmailSendPurpose Purpose, int Limit)? purposeWindowLimit = null, int? purposeWindowHours = null)
    {
        clock = new ManualClock();
        return WithManualClock(clock, perAddressDailyLimit, perAddressCooldownMinutes, purposeWindowLimit, purposeWindowHours);
    }

    /// <summary>Mbinguarkim që pranon një ManualClock tashmë të krijuar — p.sh. kur testi
    /// duhet ta pyesë bazën e të dhënave PËR DITËN E ASAJ ORE, para se factory-ja të ngrihet.</summary>
    private WebApplicationFactory<Program> WithManualClock(
        ManualClock clock, int? perAddressDailyLimit = null, int? perAddressCooldownMinutes = null,
        (EmailSendPurpose Purpose, int Limit)? purposeWindowLimit = null, int? purposeWindowHours = null)
    {
        return _factory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IDateTimeProvider>();
                services.AddSingleton<IDateTimeProvider>(clock);

                if (perAddressDailyLimit is not null || perAddressCooldownMinutes is not null
                    || purposeWindowLimit is not null || purposeWindowHours is not null)
                {
                    services.Configure<EmailAbuseLimitSettings>(o =>
                    {
                        if (perAddressDailyLimit is not null) o.PerAddressDailyLimit = perAddressDailyLimit.Value;
                        if (perAddressCooldownMinutes is not null) o.PerAddressCooldownMinutes = perAddressCooldownMinutes.Value;
                        if (purposeWindowLimit is not null)
                        {
                            o.PurposeWindowLimits[purposeWindowLimit.Value.Purpose] = purposeWindowLimit.Value.Limit;
                        }
                        if (purposeWindowHours is not null) o.PurposeWindowHours = purposeWindowHours.Value;
                    });
                }
            }));
    }

    /// <summary>
    /// Numri i tentativave për një qëllim brenda dritares rrëshqitëse që nis në
    /// <paramref name="windowStart"/> — baza ndahet me testet e tjera të collection-it,
    /// ndaj limitet llogariten mbi numrin AKTUAL, jo mbi zero.
    /// </summary>
    private async Task<int> CountAttemptsInWindowAsync(EmailSendPurpose purpose, DateTime windowStart)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        return await db.EmailSendAttempts.CountAsync(a => a.Purpose == purpose && a.CreatedAt >= windowStart);
    }

    private static (string Token, string Email) ExtractTokenAndEmail(string body)
    {
        var match = LinkRegex.Match(body);
        match.Success.Should().BeTrue($"email body should contain a confirmation/reset link: {body}");
        var uri = new Uri(match.Value);
        var query = QueryHelpers.ParseQuery(uri.Query);
        return (query["token"]!, query["email"]!);
    }

    private static async Task<IReadOnlyList<DevEmail>> DevEmailsAsync(HttpClient client, string toEmail) =>
        (await client.GetFromJsonAsync<List<DevEmail>>(
            $"/api/dev/emails?toEmail={Uri.EscapeDataString(toEmail)}", TestHelpers.Json))!;
}
