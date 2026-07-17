using Booking.Application.Common.Models;

namespace Booking.Application.Features.Appointments;

/// <summary>Rastet e përdorimit të pacientit mbi terminet — userId vjen gjithmonë nga JWT, kurrë nga klienti.</summary>
public interface IAppointmentService
{
    Task<PagedResult<AppointmentDto>> GetMyAppointmentsAsync(
        Guid userId, MyAppointmentsQuery query, CancellationToken cancellationToken = default);

    Task<AppointmentDto> GetMyAppointmentByIdAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken = default);

    Task<AppointmentDto> CreateAsync(
        Guid userId, CreateAppointmentRequest request, CancellationToken cancellationToken = default);

    Task<AppointmentDto> CancelAsync(
        Guid userId, Guid appointmentId, CancelAppointmentRequest request, CancellationToken cancellationToken = default);

    /// <summary>Termini i vjetër → Rescheduled (histori); krijohet termin i ri Pending në orarin e ri.</summary>
    Task<AppointmentDto> RescheduleAsync(
        Guid userId, Guid appointmentId, RescheduleAppointmentRequest request, CancellationToken cancellationToken = default);
}
