using Booking.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace Booking.Infrastructure.Notifications;

/// <summary>
/// Implementim development-i — vetëm logon. Në production zëvendësohet me SendGrid/SMTP
/// duke regjistruar një implementim tjetër të IEmailService në DI.
/// Kujdes: trupi i email-it mund të përmbajë token reset-i — logohet vetëm subject-i.
/// </summary>
public class LoggingEmailService : IEmailService
{
    private readonly ILogger<LoggingEmailService> _logger;

    public LoggingEmailService(ILogger<LoggingEmailService> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[EMAIL-MOCK] Për: {ToEmail} | Subjekti: {Subject} | (trupi nuk logohet)", toEmail, subject);
        _logger.LogDebug("[EMAIL-MOCK] Trupi: {Body}", body);
        return Task.CompletedTask;
    }
}

/// <summary>Mock SMS — e gatshme për t'u zëvendësuar me Twilio ose operator lokal në Kosovë.</summary>
public class LoggingSmsService : ISmsService
{
    private readonly ILogger<LoggingSmsService> _logger;

    public LoggingSmsService(ILogger<LoggingSmsService> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[SMS-MOCK] Për: {ToPhone} | Mesazhi: {Message}", toPhoneNumber, message);
        return Task.CompletedTask;
    }
}
