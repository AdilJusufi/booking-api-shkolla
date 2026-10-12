using Booking.Domain.Enums;
using Booking.Domain.Exceptions;

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

    /// <summary>
    /// NoShow dhe Completed kërkojnë që termini të ketë filluar: s'mund të mungosh në një termin që
    /// s'ka ndodhur ende, as të përfundosh një që s'ka filluar. Përdoret nga doktori DHE nga admini,
    /// që rregulli të mos anashkalohet nga paneli tjetër.
    /// </summary>
    /// <exception cref="BookingRuleException">no-show-before-start / complete-before-start</exception>
    public static void EnsureStartedIfRequired(AppointmentStatus target, DateTime appointmentStartUtc, DateTime utcNow)
    {
        if (utcNow > appointmentStartUtc)
        {
            return;
        }

        switch (target)
        {
            case AppointmentStatus.NoShow:
                throw new BookingRuleException(
                    "no-show-before-start", "NoShow mund të shënohet vetëm pasi ka kaluar ora e terminit.");
            case AppointmentStatus.Completed:
                throw new BookingRuleException(
                    "complete-before-start", "Termini mund të përfundohet vetëm pasi ka filluar.");
        }
    }

    /// <summary>Rregulli 12: pacienti anulon vetëm deri N orë (i konfigurueshëm) para terminit.</summary>
    public static bool IsWithinCancellationWindow(DateTime appointmentStartUtc, DateTime utcNow, int cutoffHours) =>
        appointmentStartUtc - utcNow >= TimeSpan.FromHours(cutoffHours);

    /// <summary>Statuset nga të cilat pacienti mund të anulojë/riplanifikojë.</summary>
    public static bool IsPatientModifiable(AppointmentStatus status) =>
        status is AppointmentStatus.Pending or AppointmentStatus.Confirmed;
}
