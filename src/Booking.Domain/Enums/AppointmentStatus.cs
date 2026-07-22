namespace Booking.Domain.Enums;

public enum AppointmentStatus
{
    Pending = 1,
    Confirmed = 2,
    CheckedIn = 3,
    InProgress = 4,
    Completed = 5,
    CancelledByPatient = 6,
    CancelledByClinic = 7,
    NoShow = 8,
    Rescheduled = 9
}
