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

    public async Task<IReadOnlyList<AvailableDayDto>> GetAvailableDaysAsync(
        Guid doctorId, AvailableDaysQuery query, CancellationToken cancellationToken = default)
    {
        var slotsByDay = await GenerateSlotsUtcAsync(
            doctorId, query.BranchId, query.ServiceId, query.From, query.To, cancellationToken);

        return slotsByDay
            .Select(day => new AvailableDayDto
            {
                Date = day.Date,
                Status = !day.HasSchedule
                    ? DayAvailability.Closed
                    : day.Slots.Count == 0 ? DayAvailability.Full : DayAvailability.Available
            })
            .ToList();
    }

    /// <summary>Burimi i vetëm i së vërtetës për slotet — përdoret nga available-slots DHE nga krijimi i rezervimit.</summary>
    private async Task<IReadOnlyList<DateTimeRange>> GenerateSlotsUtcAsync(
        Guid doctorId, Guid branchId, Guid serviceId, DateOnly date, CancellationToken cancellationToken,
        Guid? excludeAppointmentId = null)
    {
        var days = await GenerateSlotsUtcAsync(
            doctorId, branchId, serviceId, date, date, cancellationToken, excludeAppointmentId);
        return days[0].Slots;
    }

    private sealed record DaySlots(DateOnly Date, bool HasSchedule, IReadOnlyList<DateTimeRange> Slots);

    /// <summary>
    /// Slotet për çdo ditë në [from, to]. Oraret, rezervimet dhe bllokimet ngarkohen një herë për
    /// gjithë intervalin (jo një query për ditë), pastaj SlotGenerator llogarit secilën ditë.
    /// </summary>
    private async Task<IReadOnlyList<DaySlots>> GenerateSlotsUtcAsync(
        Guid doctorId, Guid branchId, Guid serviceId, DateOnly from, DateOnly to, CancellationToken cancellationToken,
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

        var schedules = await _dbContext.DoctorWorkingSchedules
            .Where(ws => ws.DoctorId == doctorId
                         && ws.ClinicBranchId == branchId
                         && ws.IsActive
                         && (ws.ValidFrom == null || ws.ValidFrom <= to)
                         && (ws.ValidUntil == null || from <= ws.ValidUntil))
            .ToListAsync(cancellationToken);

        // Periudhat e zëna gjatë ditëve lokale: rezervime aktive (në ÇDO degë — doktori
        // s'mund të jetë në dy vende njëkohësisht) + bllokimet e doktorit.
        var rangeStartUtc = _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue));
        var rangeEndUtc = _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue));

        var busyPeriods = new List<DateTimeRange>();
        if (schedules.Count > 0)
        {
            var appointments = await _dbContext.Appointments
                .Where(a => a.DoctorId == doctorId
                            && Appointment.BlockingStatuses.Contains(a.Status)
                            && a.StartDateTime < rangeEndUtc
                            && a.EndDateTime > rangeStartUtc
                            && (excludeAppointmentId == null || a.Id != excludeAppointmentId))
                .Select(a => new { a.StartDateTime, a.EndDateTime })
                .ToListAsync(cancellationToken);

            var unavailabilities = await _dbContext.DoctorUnavailabilities
                .Where(u => u.DoctorId == doctorId
                            && (u.ClinicBranchId == null || u.ClinicBranchId == branchId)
                            && u.StartDateTime < rangeEndUtc
                            && u.EndDateTime > rangeStartUtc)
                .Select(u => new { u.StartDateTime, u.EndDateTime })
                .ToListAsync(cancellationToken);

            busyPeriods.AddRange(appointments.Select(a => new DateTimeRange(a.StartDateTime, a.EndDateTime)));
            busyPeriods.AddRange(unavailabilities.Select(u => new DateTimeRange(u.StartDateTime, u.EndDateTime)));
        }

        var utcNow = _dateTimeProvider.UtcNow;
        var result = new List<DaySlots>(to.DayNumber - from.DayNumber + 1);
        for (var date = from; date <= to; date = date.AddDays(1))
        {
            var day = date;
            var daySchedules = schedules
                .Where(ws => ws.DayOfWeek == day.DayOfWeek
                             && (ws.ValidFrom == null || ws.ValidFrom <= day)
                             && (ws.ValidUntil == null || day <= ws.ValidUntil))
                .ToList();

            var slots = daySchedules.Count == 0
                ? []
                : SlotGenerator.Generate(daySchedules, day, durationMinutes, _timeZoneService.ToUtc, utcNow, busyPeriods);

            result.Add(new DaySlots(day, daySchedules.Count > 0, slots));
        }

        return result;
    }
}
