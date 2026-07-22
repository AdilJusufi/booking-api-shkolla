using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Schedules;
using Booking.Domain.Entities;
using Booking.Domain.Exceptions;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

public class ScheduleService : IScheduleService
{
    private readonly BookingDbContext _dbContext;
    private readonly ITimeZoneService _timeZoneService;

    public ScheduleService(BookingDbContext dbContext, ITimeZoneService timeZoneService)
    {
        _dbContext = dbContext;
        _timeZoneService = timeZoneService;
    }

    public async Task<Guid> GetDoctorIdForUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var doctorId = await _dbContext.Doctors
            .Where(d => d.UserId == userId && d.IsActive)
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return doctorId ?? throw new NotFoundException("Profili i doktorit nuk u gjet për këtë përdorues.");
    }

    public async Task<IReadOnlyList<WorkingScheduleDto>> GetSchedulesAsync(
        Guid doctorId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.DoctorWorkingSchedules
            .Where(ws => ws.DoctorId == doctorId)
            .OrderBy(ws => ws.DayOfWeek).ThenBy(ws => ws.StartTime)
            .Select(ws => new WorkingScheduleDto
            {
                Id = ws.Id,
                DoctorId = ws.DoctorId,
                ClinicBranchId = ws.ClinicBranchId,
                BranchName = ws.ClinicBranch.Name,
                DayOfWeek = ws.DayOfWeek,
                StartTime = ws.StartTime,
                EndTime = ws.EndTime,
                SlotDurationMinutes = ws.SlotDurationMinutes,
                IsActive = ws.IsActive,
                ValidFrom = ws.ValidFrom,
                ValidUntil = ws.ValidUntil
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<WorkingScheduleDto> AddScheduleAsync(
        Guid doctorId, CreateWorkingScheduleRequest request, CancellationToken cancellationToken = default)
    {
        var doctorAtBranch = await _dbContext.DoctorClinicBranches
            .AnyAsync(dcb => dcb.DoctorId == doctorId
                             && dcb.ClinicBranchId == request.ClinicBranchId
                             && dcb.IsActive, cancellationToken);
        if (!doctorAtBranch)
        {
            throw new BookingRuleException("doctor-not-at-branch", "Doktori nuk është i caktuar në këtë degë.");
        }

        // Kontrolli i mbivendosjes: dy rreshta orari për të njëjtën ditë/degë nuk guxojnë
        // të mbivendosen as në kohë as në periudhë vlefshmërie.
        var existingSchedules = await _dbContext.DoctorWorkingSchedules
            .Where(ws => ws.DoctorId == doctorId
                         && ws.ClinicBranchId == request.ClinicBranchId
                         && ws.DayOfWeek == request.DayOfWeek
                         && ws.IsActive)
            .ToListAsync(cancellationToken);

        var overlaps = existingSchedules.Any(existing =>
            TimesOverlap(existing.StartTime, existing.EndTime, request.StartTime, request.EndTime)
            && ValidityPeriodsOverlap(existing.ValidFrom, existing.ValidUntil, request.ValidFrom, request.ValidUntil));

        if (overlaps)
        {
            throw new ConflictException("schedule-overlap", "Orari mbivendoset me një orar ekzistues për këtë ditë.");
        }

        var schedule = new DoctorWorkingSchedule
        {
            DoctorId = doctorId,
            ClinicBranchId = request.ClinicBranchId,
            DayOfWeek = request.DayOfWeek,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            SlotDurationMinutes = request.SlotDurationMinutes,
            ValidFrom = request.ValidFrom,
            ValidUntil = request.ValidUntil
        };
        _dbContext.DoctorWorkingSchedules.Add(schedule);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var branchName = await _dbContext.ClinicBranches
            .Where(b => b.Id == request.ClinicBranchId)
            .Select(b => b.Name)
            .FirstAsync(cancellationToken);

        return new WorkingScheduleDto
        {
            Id = schedule.Id,
            DoctorId = schedule.DoctorId,
            ClinicBranchId = schedule.ClinicBranchId,
            BranchName = branchName,
            DayOfWeek = schedule.DayOfWeek,
            StartTime = schedule.StartTime,
            EndTime = schedule.EndTime,
            SlotDurationMinutes = schedule.SlotDurationMinutes,
            IsActive = schedule.IsActive,
            ValidFrom = schedule.ValidFrom,
            ValidUntil = schedule.ValidUntil
        };
    }

    public async Task DeactivateScheduleAsync(Guid doctorId, Guid scheduleId, CancellationToken cancellationToken = default)
    {
        var schedule = await _dbContext.DoctorWorkingSchedules
            .FirstOrDefaultAsync(ws => ws.Id == scheduleId && ws.DoctorId == doctorId, cancellationToken)
            ?? throw new NotFoundException("DoctorWorkingSchedule", scheduleId);

        schedule.IsActive = false;
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<UnavailabilityDto>> GetUnavailabilitiesAsync(
        Guid doctorId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var fromUtc = _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue));
        var toUtc = _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue));

        var items = await _dbContext.DoctorUnavailabilities
            .Where(u => u.DoctorId == doctorId && u.StartDateTime < toUtc && u.EndDateTime > fromUtc)
            .OrderBy(u => u.StartDateTime)
            .ToListAsync(cancellationToken);

        return items.Select(ToDto).ToList();
    }

    public async Task<UnavailabilityDto> AddUnavailabilityAsync(
        Guid doctorId, CreateUnavailabilityRequest request, CancellationToken cancellationToken = default)
    {
        if (request.ClinicBranchId is { } branchId)
        {
            var doctorAtBranch = await _dbContext.DoctorClinicBranches
                .AnyAsync(dcb => dcb.DoctorId == doctorId && dcb.ClinicBranchId == branchId && dcb.IsActive, cancellationToken);
            if (!doctorAtBranch)
            {
                throw new BookingRuleException("doctor-not-at-branch", "Doktori nuk është i caktuar në këtë degë.");
            }
        }

        var unavailability = new DoctorUnavailability
        {
            DoctorId = doctorId,
            ClinicBranchId = request.ClinicBranchId,
            StartDateTime = _timeZoneService.ToUtc(request.StartDateTime),
            EndDateTime = _timeZoneService.ToUtc(request.EndDateTime),
            Reason = request.Reason
        };
        _dbContext.DoctorUnavailabilities.Add(unavailability);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToDto(unavailability);
    }

    public async Task DeleteUnavailabilityAsync(Guid doctorId, Guid unavailabilityId, CancellationToken cancellationToken = default)
    {
        var unavailability = await _dbContext.DoctorUnavailabilities
            .FirstOrDefaultAsync(u => u.Id == unavailabilityId && u.DoctorId == doctorId, cancellationToken)
            ?? throw new NotFoundException("DoctorUnavailability", unavailabilityId);

        _dbContext.DoctorUnavailabilities.Remove(unavailability);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private UnavailabilityDto ToDto(DoctorUnavailability unavailability) => new()
    {
        Id = unavailability.Id,
        DoctorId = unavailability.DoctorId,
        ClinicBranchId = unavailability.ClinicBranchId,
        StartDateTime = _timeZoneService.ToLocal(unavailability.StartDateTime),
        EndDateTime = _timeZoneService.ToLocal(unavailability.EndDateTime),
        Reason = unavailability.Reason
    };

    private static bool TimesOverlap(TimeOnly startA, TimeOnly endA, TimeOnly startB, TimeOnly endB) =>
        startA < endB && startB < endA;

    private static bool ValidityPeriodsOverlap(DateOnly? fromA, DateOnly? untilA, DateOnly? fromB, DateOnly? untilB) =>
        (fromA ?? DateOnly.MinValue) <= (untilB ?? DateOnly.MaxValue)
        && (fromB ?? DateOnly.MinValue) <= (untilA ?? DateOnly.MaxValue);
}
