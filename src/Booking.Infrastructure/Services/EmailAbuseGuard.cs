using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Tre kontrolle sekuenciale kundër EmailSendAttempts, më i rreptit i parë (më i lirë
/// për t'u kontrolluar, dhe rasti më i zakonshëm — një kërkesë e dytë e shpejtë për të
/// njëjtën adresë). Nuk ka lock/transaction eksplicit mbi numërimin: një garë e rrallë
/// mes dy kërkesave njëkohëse për të NJËJTËN adresë mund të lejojë një send ekstra —
/// i pranueshëm këtu, pasi kjo është mbrojtje kundër abuzimit të vazhdueshëm, jo një
/// kufi që duhet saktësi deri në send-in e fundit.
/// </summary>
public class EmailAbuseGuard : IEmailAbuseGuard
{
    private readonly BookingDbContext _dbContext;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly EmailAbuseLimitSettings _settings;
    private readonly ILogger<EmailAbuseGuard> _logger;

    public EmailAbuseGuard(
        BookingDbContext dbContext,
        IDateTimeProvider dateTimeProvider,
        IOptions<EmailAbuseLimitSettings> settings,
        ILogger<EmailAbuseGuard> logger)
    {
        _dbContext = dbContext;
        _dateTimeProvider = dateTimeProvider;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<EmailSendDecision> TryRecordSendAsync(
        string email, EmailSendPurpose purpose, string? ipAddress, CancellationToken cancellationToken = default)
    {
        var normalizedEmail = Normalize(email);
        var now = _dateTimeProvider.UtcNow;
        var startOfDayUtc = now.Date;

        // 1. Cooldown për-adresë — mbron NJË adresë nga bombardimi i shpejtë, pavarësisht
        // nga sa IP të ndryshme e kërkojnë. Të dy qëllimet numërohen bashkë: alternimi
        // mes forgot-password dhe resend-confirmation s'duhet të dyfishojë buxhetin.
        var cooldownStart = now.AddMinutes(-_settings.PerAddressCooldownMinutes);
        var recentCount = await _dbContext.EmailSendAttempts
            .CountAsync(a => a.NormalizedEmail == normalizedEmail && a.CreatedAt >= cooldownStart, cancellationToken);
        if (recentCount > 0)
        {
            _logger.LogWarning(
                "Email i refuzuar (cooldown) për {NormalizedEmail}, qëllimi {Purpose}, IP {IpAddress}.",
                normalizedEmail, purpose, ipAddress ?? "e panjohur");
            return EmailSendDecision.BlockedByCooldown;
        }

        // 2. Tavani ditor për-adresë — mbron të njëjtën adresë nga dikush që e anashkalon
        // cooldown-in duke pritur mes kërkesash (ose duke përdorur shumë IP). Kufiri i
        // sipërm (< endOfDayUtc) është eksplicit — pa vlerë reale në prodhim (koha e
        // vërtetë s'ka rreshta "të ardhshëm"), por i saktë sipas vetë përkufizimit "sot".
        var endOfDayUtc = startOfDayUtc.AddDays(1);
        var addressDailyCount = await _dbContext.EmailSendAttempts
            .CountAsync(a => a.NormalizedEmail == normalizedEmail && a.CreatedAt >= startOfDayUtc && a.CreatedAt < endOfDayUtc, cancellationToken);
        if (addressDailyCount >= _settings.PerAddressDailyLimit)
        {
            _logger.LogWarning(
                "Email i refuzuar (tavani ditor për-adresë: {Count}/{Limit}) për {NormalizedEmail}, qëllimi {Purpose}, IP {IpAddress}.",
                addressDailyCount, _settings.PerAddressDailyLimit, normalizedEmail, purpose, ipAddress ?? "e panjohur");
            return EmailSendDecision.BlockedByAddressDailyLimit;
        }

        // 3. Tavani PËR QËLLIM mbi një dritare RRËSHQITËSE — mbron kuotën e Resend nga çdo
        // kombinim enumerimi (shumë adresa, shumë IP).
        //
        // Dy ndryshime ndaj versionit të mëparshëm, secili për një dështim konkret:
        //   • Ndarja sipas qëllimit: më parë një numërues i vetëm i përbashkët do të thoshte
        //     se shterja e tij me ridërgime konfirmimi bllokonte edhe rivendosjen e
        //     password-it. Tani secili qëllim ka buxhetin e vet dhe s'e uritë dot tjetrin.
        //   • Dritare rrëshqitëse: më parë numërimi niste nga mesnata UTC, ndaj një shpërthim
        //     i vetëm i mbante email-et të bllokuara deri në një kufi arbitrar sahati. Tani
        //     kapaciteti kthehet vetvetiu sapo tentativat e vjetra dalin nga dritarja.
        //
        // Log-u mbetet Error, jo Warning: prekja e këtij tavani do të thotë ose abuzim në
        // vazhdim, ose se kufijtë janë nën trafikun real — të dyja kërkojnë sy njerëzor.
        var windowStart = now.AddHours(-_settings.PurposeWindowHours);
        var purposeLimit = _settings.PurposeWindowLimits.TryGetValue(purpose, out var configuredLimit)
            ? configuredLimit
            : _settings.DefaultPurposeWindowLimit;

        var purposeWindowCount = await _dbContext.EmailSendAttempts
            .CountAsync(a => a.Purpose == purpose && a.CreatedAt >= windowStart, cancellationToken);
        if (purposeWindowCount >= purposeLimit)
        {
            _logger.LogError(
                "Email i refuzuar (TAVANI PËR QËLLIM {Purpose}: {Count}/{Limit} në {WindowHours}h) — " +
                "kërkon vëmendje të menjëhershme. Adresa {NormalizedEmail}, IP {IpAddress}.",
                purpose, purposeWindowCount, purposeLimit, _settings.PurposeWindowHours,
                normalizedEmail, ipAddress ?? "e panjohur");
            return EmailSendDecision.BlockedByPurposeWindowLimit;
        }

        _dbContext.EmailSendAttempts.Add(new EmailSendAttempt
        {
            NormalizedEmail = normalizedEmail,
            Purpose = purpose,
            IpAddress = ipAddress,
            CreatedAt = now
        });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return EmailSendDecision.Allowed;
    }

    private static string Normalize(string email) => email.Trim().ToUpperInvariant();
}
