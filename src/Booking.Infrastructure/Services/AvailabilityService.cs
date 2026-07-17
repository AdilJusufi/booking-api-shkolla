using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Availability;
using Booking.Domain.Entities;
using Booking.Domain.Exceptions;
using Booking.Domain.Services;
using Booking.Domain.ValueObjects;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

public class AvailabilityService : IAvailabilityService
{
    private readonly BookingDbContext _dbContext;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;

    public AvailabilityService(
        BookingDbContext dbContext,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService)
    {
        _dbContext = dbContext;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
    }

    public async Task<IReadOnlyList<AvailableSlotDto>> GetAvailableSlotsAsync(
        Guid doctorId, AvailableSlotsQuery query, CancellationToken cancellationToken = default)
    {
        var slotsUtc = await GenerateSlotsUtcAsync(doctorId, query.BranchId, query.ServiceId, query.Date, cancellationToken);

        return slotsUtc
            .Select(slot => new AvailableSlotDto
            {
                StartDateTime = _timeZoneService.ToLocal(slot.Start),
                EndDateTime = _timeZoneService.ToLocal(slot.End),
                IsAvailable = true,
                DoctorId = doctorId,
                BranchId = query.BranchId,
                ServiceId = query.ServiceId
            })
            .ToList();
    }

    public async Task<bool> IsSlotAvailableAsync(
        Guid doctorId, Guid branchId, Guid serviceId, DateTime localStartDateTime,
        Guid? excludeAppointmentId = null, CancellationToken cancellationToken = default)
    {
        var date = DateOnly.FromDateTime(localStartDateTime);
        var slotsUtc = await GenerateSlotsUtcAsync(
            doctorId, branchId, serviceId, date, cancellationToken, excludeAppointmentId);
        var startUtc = _timeZoneService.ToUtc(localStartDateTime);

        return slotsUtc.Any(slot => slot.Start == startUtc);
    }

    /// <summary>Burimi i vetëm i së vërtetës për slotet — përdoret nga available-slots DHE nga krijimi i rezervimit.</summary>
    private async Task<IReadOnlyList<DateTimeRange>> GenerateSlotsUtcAsync(
        Guid doctorId, Guid branchId, Guid serviceId, DateOnly date, CancellationToken cancellationToken,
        Guid? excludeAppointmentId = null)
    {
        var doctorExists = await _dbContext.Doctors
            .AnyAsync(d => d.Id == doctorId && d.IsActive && d.IsVerified, cancellationToken);
        if (!doctorExists)
        {
            throw new NotFoundException("Doctor", doctorId);
        }

        var branch = await _dbContext.ClinicBranches
            .Where(b => b.Id == branchId && b.IsActive && b.Clinic.IsApproved && b.Clinic.IsActive)
            .Select(b => new { b.Id, b.ClinicId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("ClinicBranch", branchId);

        var doctorAtBranch = await _dbContext.DoctorClinicBranches
            .AnyAsync(dcb => dcb.DoctorId == doctorId && dcb.ClinicBranchId == branchId && dcb.IsActive, cancellationToken);
        if (!doctorAtBranch)
        {
            throw new BookingRuleException("doctor-not-at-branch", "Doktori nuk punon në degën e zgjedhur.");
        }

        var service = await _dbContext.MedicalServices
            .Where(s => s.Id == serviceId && s.IsActive)
            .Select(s => new { s.ClinicId, s.DurationMinutes })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("MedicalService", serviceId);

        if (service.ClinicId != branch.ClinicId)
        {
            throw new BookingRuleException("service-not-in-clinic", "Shërbimi nuk i përket klinikës së degës së zgjedhur.");
        }

        var doctorService = await _dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId && ds.MedicalServiceId == serviceId && ds.IsActive)
            .Select(ds => new { ds.CustomDurationMinutes })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BookingRuleException("service-not-offered-by-doctor", "Doktori nuk e ofron këtë shërbim.");

        var durationMinutes = doctorService.CustomDurationMinutes ?? service.DurationMinutes;

        var dayOfWeek = date.DayOfWeek;
        var schedules = await _dbContext.DoctorWorkingSchedules
            .Where(ws => ws.DoctorId == doctorId
                         && ws.ClinicBranchId == branchId
                         && ws.IsActive
                         && ws.DayOfWeek == dayOfWeek
                         && (ws.ValidFrom == null || ws.ValidFrom <= date)
                         && (ws.ValidUntil == null || date <= ws.ValidUntil))
            .ToListAsync(cancellationToken);

        if (schedules.Count == 0)
        {
            return [];
        }

        // Periudhat e zëna gjatë ditës lokale: rezervime aktive (në ÇDO degë — doktori
        // s'mund të jetë në dy vende njëkohësisht) + bllokimet e doktorit.
        var dayStartUtc = _timeZoneService.ToUtc(date.ToDateTime(TimeOnly.MinValue));
        var dayEndUtc = _timeZoneService.ToUtc(date.AddDays(1).ToDateTime(TimeOnly.MinValue));

        var appointments = await _dbContext.Appointments
            .Where(a => a.DoctorId == doctorId
                        && Appointment.BlockingStatuses.Contains(a.Status)
                        && a.StartDateTime < dayEndUtc
                        && a.EndDateTime > dayStartUtc
                        && (excludeAppointmentId == null || a.Id != excludeAppointmentId))
            .Select(a => new { a.StartDateTime, a.EndDateTime })
            .ToListAsync(cancellationToken);

        var unavailabilities = await _dbContext.DoctorUnavailabilities
            .Where(u => u.DoctorId == doctorId
                        && (u.ClinicBranchId == null || u.ClinicBranchId == branchId)
                        && u.StartDateTime < dayEndUtc
                        && u.EndDateTime > dayStartUtc)
            .Select(u => new { u.StartDateTime, u.EndDateTime })
            .ToListAsync(cancellationToken);

        var busyPeriods = appointments
            .Select(a => new DateTimeRange(a.StartDateTime, a.EndDateTime))
            .Concat(unavailabilities.Select(u => new DateTimeRange(u.StartDateTime, u.EndDateTime)))
            .ToList();

        return SlotGenerator.Generate(
            schedules, date, durationMinutes, _timeZoneService.ToUtc, _dateTimeProvider.UtcNow, busyPeriods);
    }
}
