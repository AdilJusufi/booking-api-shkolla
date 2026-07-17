using Booking.Domain.Enums;

namespace Booking.Domain.Services;

/// <summary>Rregullat e ciklit jetësor të terminit — të pastra dhe të testueshme pa databazë.</summary>
public static class BookingPolicy
{
    private static readonly Dictionary<AppointmentStatus, AppointmentStatus[]> AllowedTransitions = new()
    {
        [AppointmentStatus.Pending] =
        [
            AppointmentStatus.Confirmed,
            AppointmentStatus.CancelledByPatient,
            AppointmentStatus.CancelledByClinic,
            AppointmentStatus.Rescheduled,
            AppointmentStatus.NoShow
        ],
        [AppointmentStatus.Confirmed] =
        [
            AppointmentStatus.CheckedIn,
            AppointmentStatus.InProgress,
            AppointmentStatus.Completed,
            AppointmentStatus.CancelledByPatient,
            AppointmentStatus.CancelledByClinic,
            AppointmentStatus.Rescheduled,
            AppointmentStatus.NoShow
        ],
        [AppointmentStatus.CheckedIn] =
        [
            AppointmentStatus.InProgress,
            AppointmentStatus.Completed,
            AppointmentStatus.NoShow
        ],
        [AppointmentStatus.InProgress] = [AppointmentStatus.Completed]
    };

    public static bool CanTransition(AppointmentStatus from, AppointmentStatus to) =>
        AllowedTransitions.TryGetValue(from, out var allowed) && allowed.Contains(to);

    /// <summary>Rregulli 12: pacienti anulon vetëm deri N orë (i konfigurueshëm) para terminit.</summary>
    public static bool IsWithinCancellationWindow(DateTime appointmentStartUtc, DateTime utcNow, int cutoffHours) =>
        appointmentStartUtc - utcNow >= TimeSpan.FromHours(cutoffHours);

    /// <summary>Statuset nga të cilat pacienti mund të anulojë/riplanifikojë.</summary>
    public static bool IsPatientModifiable(AppointmentStatus status) =>
        status is AppointmentStatus.Pending or AppointmentStatus.Confirmed;
}
