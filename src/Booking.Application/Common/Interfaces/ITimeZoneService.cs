namespace Booking.Application.Common.Interfaces;

/// <summary>
/// Konvertimi UTC ↔ ora lokale e Prishtinës (IANA: Europe/Belgrade).
/// Databaza ruan gjithmonë UTC; API pranon dhe kthen kohë lokale.
/// </summary>
public interface ITimeZoneService
{
    DateTime ToUtc(DateTime localDateTime);
    DateTime ToLocal(DateTime utcDateTime);
    DateOnly ToLocalDate(DateTime utcDateTime);
}
