namespace Booking.Application.Common.Models;

public sealed class BookingSettings
{
    public const string SectionName = "Booking";

    /// <summary>Sa orë para terminit pacienti mund të anulojë/riplanifikojë (rregulli 12).</summary>
    public int CancellationCutoffHours { get; set; } = 12;
}
