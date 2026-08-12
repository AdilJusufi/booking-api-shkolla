using System.Collections.Concurrent;
using Booking.Application.Common.Interfaces;

namespace Booking.Infrastructure.Notifications;

/// <summary>Një email i "dërguar" gjatë zhvillimit — mbahet vetëm në memorie.</summary>
public sealed record DevEmail(string ToEmail, string Subject, string Body, DateTime SentAtUtc);

/// <summary>
/// Kutia postare e zhvillimit: ruan email-at e fundit në memorie që frontend-i
/// të mund të marrë token-at e konfirmimit/rivendosjes pa pasur qasje në logje.
/// Regjistrohet VETËM në Development (shih AddInfrastructure) dhe endpoint-i që
/// e lexon kthen 404 jashtë Development-it.
/// </summary>
public sealed class DevEmailInbox
{
    private const int Capacity = 100;

    private readonly ConcurrentQueue<DevEmail> _messages = new();

    public void Record(DevEmail message)
    {
        _messages.Enqueue(message);

        // Ring buffer — mbajmë vetëm të fundit që të mos rritet pafund.
        while (_messages.Count > Capacity && _messages.TryDequeue(out _))
        {
        }
    }

    /// <summary>Më i riu i pari. Filtrimi sipas marrësit është opsional.</summary>
    public IReadOnlyList<DevEmail> Recent(string? toEmail = null)
    {
        var all = _messages.ToArray().Reverse();

        return string.IsNullOrWhiteSpace(toEmail)
            ? all.ToList()
            : all.Where(m => string.Equals(m.ToEmail, toEmail, StringComparison.OrdinalIgnoreCase)).ToList();
    }
}

/// <summary>
/// Dekorator mbi IEmailService: e ruan mesazhin në DevEmailInbox dhe ia kalon
/// implementimit real (në Development: logging). Nuk ndryshon sjelljen e dërgimit.
/// </summary>
public sealed class DevInboxEmailService : IEmailService
{
    private readonly IEmailService _inner;
    private readonly DevEmailInbox _inbox;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DevInboxEmailService(IEmailService inner, DevEmailInbox inbox, IDateTimeProvider dateTimeProvider)
    {
        _inner = inner;
        _inbox = inbox;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        _inbox.Record(new DevEmail(toEmail, subject, body, _dateTimeProvider.UtcNow));
        await _inner.SendAsync(toEmail, subject, body, cancellationToken);
    }
}
