using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Doctors;
using Booking.Application.Features.Schedules;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Domain.Exceptions;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Booking.Infrastructure.Services;

public class ScheduleService : IScheduleService
{
    private readonly BookingDbContext _dbContext;
    private readonly ITimeZoneService _timeZoneService;
    private readonly IAppointmentNotificationService _notificationService;
    private readonly ILogger<ScheduleService> _logger;

    public ScheduleService(
        BookingDbContext dbContext,
        ITimeZoneService timeZoneService,
        IAppointmentNotificationService notificationService,
        ILogger<ScheduleService> logger)
    {
        _dbContext = dbContext;
        _timeZoneService = timeZoneService;
        _notificationService = notificationService;
        _logger = logger;
    }

    public async Task<Guid> GetDoctorIdForUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var doctorId = await _dbContext.Doctors
            .Where(d => d.UserId == userId && d.IsActive)
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return doctorId ?? throw new NotFoundException("Profili i doktorit nuk u gjet për këtë përdorues.");
    }

    public async Task<IReadOnlyList<DoctorBranchDto>> GetDoctorBranchesAsync(
        Guid doctorId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.DoctorClinicBranches
            .Where(dcb => dcb.DoctorId == doctorId && dcb.IsActive && dcb.ClinicBranch.IsActive)
            .OrderBy(dcb => dcb.ClinicBranch.Name)
            .Select(dcb => new DoctorBranchDto
            {
                BranchId = dcb.ClinicBranchId,
                BranchName = dcb.ClinicBranch.Name,
                ClinicId = dcb.ClinicBranch.ClinicId,
                ClinicName = dcb.ClinicBranch.Clinic.Name,
                City = dcb.ClinicBranch.City,
                Address = dcb.ClinicBranch.Address
            })
            .ToListAsync(cancellationToken);
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

        // DoctorUnavailability s'ka navigation drejt ClinicBranch — emrat i marrim
        // me një query të vetme dhe i denormalizojmë si te WorkingScheduleDto.
        var branchNames = await GetBranchNamesAsync(
            items.Select(u => u.ClinicBranchId).OfType<Guid>().Distinct().ToList(), cancellationToken);

        return items.Select(u => ToDto(u, branchNames)).ToList();
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

        var branchNames = await GetBranchNamesAsync(
            unavailability.ClinicBranchId is { } id ? [id] : [], cancellationToken);

        await NotifyConflictingAppointmentsSafeAsync(doctorId, unavailability, cancellationToken);

        return ToDto(unavailability, branchNames);
    }

    /// <summary>
    /// Deri tani asnjë kontroll s'ekzistonte: një paarritshmëri e re mund të përplasej në
    /// heshtje me termine tashmë të konfirmuara. Këtu vetëm njoftohen pacienti i prekur dhe
    /// klinika — nuk anulohet apo bllokohet vetë termini, sepse kjo do të ishte një ndryshim
    /// i sjelljes më i madh se sa u kërkua; riplanifikimi mbetet veprim manual i klinikës.
    /// </summary>
    private async Task NotifyConflictingAppointmentsSafeAsync(
        Guid doctorId, DoctorUnavailability unavailability, CancellationToken cancellationToken)
    {
        try
        {
            var conflicting = await _dbContext.Appointments
                .Where(a => a.DoctorId == doctorId
                            && a.Status == AppointmentStatus.Confirmed
                            && a.StartDateTime < unavailability.EndDateTime
                            && a.EndDateTime > unavailability.StartDateTime
                            && (unavailability.ClinicBranchId == null || a.ClinicBranchId == unavailability.ClinicBranchId))
                .Select(a => new
                {
                    a.Id,
                    a.ClinicId,
                    ClinicName = a.Clinic.Name,
                    ServiceName = a.MedicalService.Name,
                    a.StartDateTime,
                    PatientEmail = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.Email).First(),
                    PatientPhoneNumber = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.PhoneNumber).First(),
                    PatientName = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.FirstName + " " + u.LastName).First()
                })
                .ToListAsync(cancellationToken);

            if (conflicting.Count == 0)
            {
                return;
            }

            var doctorName = await _dbContext.Users
                .Where(u => u.Id == _dbContext.Doctors.Where(d => d.Id == doctorId).Select(d => d.UserId).First())
                .Select(u => u.FirstName + " " + u.LastName)
                .FirstAsync(cancellationToken);

            foreach (var appointment in conflicting)
            {
                var startLocal = _timeZoneService.ToLocal(appointment.StartDateTime);

                await _notificationService.AppointmentUnavailabilityConflictAsync(new AppointmentNotificationContext
                {
                    AppointmentId = appointment.Id,
                    PatientEmail = appointment.PatientEmail,
                    PatientPhoneNumber = appointment.PatientPhoneNumber,
                    PatientName = appointment.PatientName,
                    DoctorName = doctorName,
                    ClinicName = appointment.ClinicName,
                    ServiceName = appointment.ServiceName,
                    StartDateTimeLocal = startLocal
                }, cancellationToken);

                var clinicAdmins = await ClinicAdministratorLookup.LoadForClinicAsync(_dbContext, appointment.ClinicId, cancellationToken);

                await _notificationService.AppointmentUnavailabilityConflictForStaffAsync(new AppointmentStaffNotificationContext
                {
                    AppointmentId = appointment.Id,
                    PatientName = appointment.PatientName,
                    DoctorName = doctorName,
                    DoctorEmail = null,
                    ClinicName = appointment.ClinicName,
                    ClinicAdminEmails = clinicAdmins.Select(a => a.Email).ToList(),
                    ServiceName = appointment.ServiceName,
                    StartDateTimeLocal = startLocal
                }, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Njoftimi i konfliktit të paarritshmërisë dështoi për doktorin {DoctorId}", doctorId);
        }
    }

    public async Task DeleteUnavailabilityAsync(Guid doctorId, Guid unavailabilityId, CancellationToken cancellationToken = default)
    {
        var unavailability = await _dbContext.DoctorUnavailabilities
            .FirstOrDefaultAsync(u => u.Id == unavailabilityId && u.DoctorId == doctorId, cancellationToken)
            ?? throw new NotFoundException("DoctorUnavailability", unavailabilityId);

        _dbContext.DoctorUnavailabilities.Remove(unavailability);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<Dictionary<Guid, string>> GetBranchNamesAsync(
        IReadOnlyCollection<Guid> branchIds, CancellationToken cancellationToken)
    {
        if (branchIds.Count == 0)
        {
            return [];
        }

        return await _dbContext.ClinicBranches
            .Where(b => branchIds.Contains(b.Id))
            .Select(b => new { b.Id, b.Name })
            .ToDictionaryAsync(b => b.Id, b => b.Name, cancellationToken);
    }

    private UnavailabilityDto ToDto(
        DoctorUnavailability unavailability, IReadOnlyDictionary<Guid, string> branchNames) => new()
    {
        Id = unavailability.Id,
        DoctorId = unavailability.DoctorId,
        ClinicBranchId = unavailability.ClinicBranchId,
        BranchName = unavailability.ClinicBranchId is { } branchId && branchNames.TryGetValue(branchId, out var name)
            ? name
            : null,
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
