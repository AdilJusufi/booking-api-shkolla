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

        // 3. Tavani ditor GLOBAL — mbron kuotën e Resend nga çdo kombinim enumerimi
        // (shumë adresa, shumë IP). Këtu llog-u është Error, jo Warning: kjo do të thotë
        // që dikush po e ngjesh kufirin real të llogarisë Resend, dhe nëse mbetet i
        // pavërejtur, rivendosja e password-it/konfirmimi ndalojnë për TË GJITHË —
        // heshtja këtu është vetë dëmi që kufiri synon ta parandalojë.
        var globalDailyCount = await _dbContext.EmailSendAttempts
            .CountAsync(a => a.CreatedAt >= startOfDayUtc && a.CreatedAt < endOfDayUtc, cancellationToken);
        if (globalDailyCount >= _settings.GlobalDailyLimit)
        {
            _logger.LogError(
                "Email i refuzuar (TAVANI GLOBAL DITOR: {Count}/{Limit}) — kërkon vëmendje të menjëhershme. " +
                "Adresa {NormalizedEmail}, qëllimi {Purpose}, IP {IpAddress}.",
                globalDailyCount, _settings.GlobalDailyLimit, normalizedEmail, purpose, ipAddress ?? "e panjohur");
            return EmailSendDecision.BlockedByGlobalDailyLimit;
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
