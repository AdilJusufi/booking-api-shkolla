using Booking.Application.Common.Models;

namespace Booking.Application.Features.Appointments;

/// <summary>Rastet e përdorimit të doktorit mbi kalendarin e vet — sheh dhe menaxhon VETËM terminet e veta.</summary>
public interface IDoctorAppointmentService
{
    Task<PagedResult<DoctorAppointmentDto>> GetMyCalendarAsync(
        Guid userId, DoctorAppointmentsQuery query, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> GetByIdAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> ConfirmAsync(Guid userId, Guid appointmentId, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> CompleteAsync(Guid userId, Guid appointmentId, CancellationToken cancellationToken = default);

    /// <summary>NoShow lejohet vetëm pasi ka kaluar ora e fillimit të terminit.</summary>
    Task<DoctorAppointmentDto> MarkNoShowAsync(Guid userId, Guid appointmentId, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> UpdateInternalNoteAsync(
        Guid userId, Guid appointmentId, UpdateInternalNoteRequest request, CancellationToken cancellationToken = default);
}
