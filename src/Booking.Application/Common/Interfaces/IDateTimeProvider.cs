namespace Booking.Application.Common.Interfaces;

/// <summary>Abstraksion mbi kohën — lejon testim deterministik të rregullave kohore.</summary>
public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}
