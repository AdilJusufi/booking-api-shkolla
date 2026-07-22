namespace Booking.Application.Features.Availability;

public interface IAvailabilityService
{
    /// <summary>Kthen vetëm slotet realisht të rezervueshme për doktorin/degën/shërbimin në datën e dhënë.</summary>
    Task<IReadOnlyList<AvailableSlotDto>> GetAvailableSlotsAsync(
        Guid doctorId, AvailableSlotsQuery query, CancellationToken cancellationToken = default);

    /// <summary>
    /// A është i lirë sloti që fillon në 'localStartDateTime' (ora e Prishtinës)?
    /// Përdoret nga krijimi i rezervimit — i njëjti burim i së vërtetës si available-slots.
    /// </summary>
    /// <param name="excludeAppointmentId">Te riplanifikimi: termini ekzistues nuk e bllokon veten.</param>
    Task<bool> IsSlotAvailableAsync(
        Guid doctorId, Guid branchId, Guid serviceId, DateTime localStartDateTime,
        Guid? excludeAppointmentId = null, CancellationToken cancellationToken = default);
}
