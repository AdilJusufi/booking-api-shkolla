namespace Booking.Application.Common.Models;

/// <summary>
/// Kujtesat me email ~24 orë para terminit (AppointmentReminderService). Vlerat e parazgjedhura
/// janë ato të prodhimit; ndryshohen me env vars (p.sh. Reminders__Enabled=false për ta fikur
/// menjëherë, pa deploy kodi).
/// </summary>
public sealed class ReminderSettings
{
    public const string SectionName = "Reminders";

    public bool Enabled { get; set; } = true;

    /// <summary>Sa shpesh ekzekutohet puna.</summary>
    public int IntervalMinutes { get; set; } = 15;

    /// <summary>
    /// Pritja pas nisjes së procesit para ekzekutimit të parë — pak sekonda që migrimet/seed-i
    /// dhe kërkesa e parë (që e zgjoi Render-in) të kalojnë pa garuar me punën.
    /// </summary>
    public int StartupDelaySeconds { get; set; } = 30;

    /// <summary>Dritarja normale: termine që nisin pas [Start, End] orësh.</summary>
    public int WindowStartHours { get; set; } = 22;
    public int WindowEndHours { get; set; } = 26;

    /// <summary>
    /// Kufiri i poshtëm absolut gjatë "rikuperimit" pas gjumit: asnjë kujtesë për termine
    /// që nisin për më pak se kaq orë (ose që kanë kaluar).
    /// </summary>
    public int MinimumLeadHours { get; set; } = 2;

    /// <summary>Terminet e rezervuara më pak se kaq orë përpara s'marrin kujtesë.</summary>
    public int MinimumBookingLeadHours { get; set; } = 24;
}
