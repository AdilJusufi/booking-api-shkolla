using Booking.Application.Common.Interfaces;

namespace Booking.Infrastructure.Common;

/// <summary>
/// Prishtina përdor zonën IANA "Europe/Belgrade" (CET/CEST).
/// .NET 8 e njeh ID-në IANA edhe në Windows (përmes ICU).
///
/// RREGULLI I KOHËS (i vetmi vend në backend ku kohët konvertohen):
///   • Momentet (termine, mungesa, gjithçka me datë + orë) ruhen në UTC.
///   • API-ja pranon dhe kthen orën e klinikës (Europe/Belgrade) si "wall-clock"
///     pa zhvendosje — "2026-10-30T09:00:00" do të thotë 09:00 në Prishtinë,
///     pavarësisht zonës së shfletuesit apo të serverit.
///   • Orari javor i punës mbetet orë lokale (dita e javës + TimeOnly) dhe
///     interpretohet në Europe/Belgrade.
/// Asnjë shërbim tjetër nuk duhet të thërrasë ToUniversalTime/SpecifyKind mbi kohë
/// që vijnë nga klienti — gjithçka kalon nga këtu.
/// </summary>
public sealed class TimeZoneService : ITimeZoneService
{
    private static readonly TimeZoneInfo PrishtinaTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById("Europe/Belgrade");

    /// <summary>
    /// Ora e klinikës → UTC. Një vlerë që vjen me zhvendosje të qartë ("…Z" ose "+02:00")
    /// është tashmë një moment i saktë dhe s'riinterpretohet si orë lokale — pikërisht
    /// ky riinterpretim e zhvendoste një mungesë 09:00–17:00 në 08:00–16:00 (WR-03).
    /// </summary>
    public DateTime ToUtc(DateTime localDateTime)
    {
        switch (localDateTime.Kind)
        {
            case DateTimeKind.Utc:
                return localDateTime;
            case DateTimeKind.Local:
                // System.Text.Json jep Kind=Local për një string me zhvendosje jo-zero:
                // momenti është i saktë, vetëm i shprehur në zonën e serverit.
                return localDateTime.ToUniversalTime();
            default:
                return TimeZoneInfo.ConvertTimeToUtc(localDateTime, PrishtinaTimeZone);
        }
    }

    /// <summary>UTC → ora e klinikës (Kind=Unspecified, serializohet pa "Z").</summary>
    public DateTime ToLocal(DateTime utcDateTime)
    {
        var utc = DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
        return DateTime.SpecifyKind(TimeZoneInfo.ConvertTimeFromUtc(utc, PrishtinaTimeZone), DateTimeKind.Unspecified);
    }

    public DateOnly ToLocalDate(DateTime utcDateTime) => DateOnly.FromDateTime(ToLocal(utcDateTime));
}
