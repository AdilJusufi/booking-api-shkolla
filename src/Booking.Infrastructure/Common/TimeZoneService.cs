using Booking.Application.Common.Interfaces;

namespace Booking.Infrastructure.Common;

/// <summary>
/// Prishtina përdor zonën IANA "Europe/Belgrade" (CET/CEST).
/// .NET 8 e njeh ID-në IANA edhe në Windows (përmes ICU).
/// </summary>
public sealed class TimeZoneService : ITimeZoneService
{
    private static readonly TimeZoneInfo PrishtinaTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Belgrade");

    public DateTime ToUtc(DateTime localDateTime)
    {
        var unspecified = DateTime.SpecifyKind(localDateTime, DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(unspecified, PrishtinaTimeZone);
    }

    public DateTime ToLocal(DateTime utcDateTime)
    {
        var utc = DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(utc, PrishtinaTimeZone);
    }

    public DateOnly ToLocalDate(DateTime utcDateTime) => DateOnly.FromDateTime(ToLocal(utcDateTime));
}
