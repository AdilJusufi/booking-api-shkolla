namespace Booking.Application.Common.Interfaces;

/// <summary>
/// Dërgimi i email-eve. Në V1 implementimi vetëm logon (LoggingEmailService);
/// struktura është gati për SendGrid ose SMTP më vonë.
/// </summary>
public interface IEmailService
{
    Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default);
}

/// <summary>
/// Dërgimi i SMS-ve. Në V1 vetëm logon; e gatshme për Twilio ose një operator lokal në Kosovë.
/// </summary>
public interface ISmsService
{
    Task SendAsync(string toPhoneNumber, string message, CancellationToken cancellationToken = default);
}
