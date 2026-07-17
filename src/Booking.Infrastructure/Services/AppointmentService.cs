using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Availability;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Domain.Exceptions;
using Booking.Domain.Services;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Booking.Infrastructure.Services;

public class AppointmentService : IAppointmentService
{
    private readonly BookingDbContext _dbContext;
    private readonly IAvailabilityService _availabilityService;
    private readonly IAppointmentNotificationService _notificationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;
    private readonly BookingSettings _bookingSettings;
    private readonly ILogger<AppointmentService> _logger;

    public AppointmentService(
        BookingDbContext dbContext,
        IAvailabilityService availabilityService,
        IAppointmentNotificationService notificationService,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService,
        IOptions<BookingSettings> bookingSettings,
        ILogger<AppointmentService> logger)
    {
        _dbContext = dbContext;
        _availabilityService = availabilityService;
        _notificationService = notificationService;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
        _bookingSettings = bookingSettings.Value;
        _logger = logger;
    }

    public async Task<PagedResult<AppointmentDto>> GetMyAppointmentsAsync(
        Guid userId, MyAppointmentsQuery query, CancellationToken cancellationToken = default)
    {
        var patientProfileId = await GetPatientProfileIdAsync(userId, cancellationToken);

        var rows = QueryRows(a => a.PatientProfileId == patientProfileId);

        if (query.From is { } from)
        {
            var fromUtc = _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue));
            rows = rows.Where(r => r.StartUtc >= fromUtc);
        }

        if (query.To is { } to)
        {
            var toUtc = _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue));
            rows = rows.Where(r => r.StartUtc < toUtc);
        }

        if (query.Status is { } status)
        {
            rows = rows.Where(r => r.Status == status);
        }

        var totalItems = await rows.CountAsync(cancellationToken);
        var items = await rows
            .OrderByDescending(r => r.StartUtc)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<AppointmentDto>
        {
            Items = items.Select(ToDto).ToList(),
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems
        };
    }

    public async Task<AppointmentDto> GetMyAppointmentByIdAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken = default)
    {
        var patientProfileId = await GetPatientProfileIdAsync(userId, cancellationToken);

        var row = await QueryRows(a => a.Id == appointmentId && a.PatientProfileId == patientProfileId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Appointment", appointmentId);

        return ToDto(row);
    }

    public async Task<AppointmentDto> CreateAsync(
        Guid userId, CreateAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        var patientProfileId = await GetPatientProfileIdAsync(userId, cancellationToken);

        // Rregulli 11: dependenti duhet t'i përkasë pacientit të kyçur.
        if (request.DependentId is { } dependentId)
        {
            var ownsDependent = await _dbContext.Dependents.AnyAsync(
                d => d.Id == dependentId && d.PatientProfileId == patientProfileId && d.IsActive, cancellationToken);
            if (!ownsDependent)
            {
                throw new ForbiddenAccessException("Dependenti nuk i përket llogarisë suaj.");
            }
        }

        var startUtc = _timeZoneService.ToUtc(request.StartDateTime);
        var utcNow = _dateTimeProvider.UtcNow;
        if (startUtc <= utcNow)
        {
            throw new BookingRuleException("appointment-in-past", "Termini nuk mund të rezervohet në të kaluarën.");
        }

        var branch = await _dbContext.ClinicBranches
            .Where(b => b.Id == request.ClinicBranchId && b.IsActive)
            .Select(b => new { b.ClinicId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("ClinicBranch", request.ClinicBranchId);

        var durationMinutes = await GetEffectiveDurationAsync(request.DoctorId, request.MedicalServiceId, cancellationToken);
        var endUtc = startUtc.AddMinutes(durationMinutes);

        await EnsureNoPersonOverlapAsync(
            patientProfileId, request.DependentId, startUtc, endUtc, excludeAppointmentId: null, cancellationToken);

        // Shtresa 1: kontroll aplikativ — i njëjti burim i së vërtetës si available-slots
        // (orari i doktorit, bllokimet, grid-i i sloteve, rezervimet ekzistuese).
        var slotAvailable = await _availabilityService.IsSlotAvailableAsync(
            request.DoctorId, request.ClinicBranchId, request.MedicalServiceId, request.StartDateTime,
            excludeAppointmentId: null, cancellationToken);
        if (!slotAvailable)
        {
            throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është më i lirë.");
        }

        var appointment = new Appointment
        {
            ClinicId = branch.ClinicId,
            ClinicBranchId = request.ClinicBranchId,
            DoctorId = request.DoctorId,
            MedicalServiceId = request.MedicalServiceId,
            PatientProfileId = patientProfileId,
            DependentId = request.DependentId,
            StartDateTime = startUtc,
            EndDateTime = endUtc,
            Status = AppointmentStatus.Pending,
            PatientNote = request.PatientNote
        };
        _dbContext.Appointments.Add(appointment);

        // Shtresa 2: exclusion constraint i PostgreSQL — nëse dy kërkesa paralele
        // e kalojnë kontrollin aplikativ njëkohësisht, vetëm INSERT-i i parë fiton;
        // i dyti merr 23P01 (exclusion_violation) → HTTP 409.
        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetMyAppointmentByIdAsync(userId, appointment.Id, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentCreatedAsync, userId, dto, cancellationToken);
        return dto;
    }

    public async Task<AppointmentDto> CancelAsync(
        Guid userId, Guid appointmentId, CancelAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        var appointment = await GetOwnedAppointmentAsync(userId, appointmentId, cancellationToken);

        if (!BookingPolicy.IsPatientModifiable(appointment.Status))
        {
            throw new BookingRuleException("not-cancellable", $"Termini me status {appointment.Status} nuk mund të anulohet.");
        }

        var utcNow = _dateTimeProvider.UtcNow;
        if (!BookingPolicy.IsWithinCancellationWindow(
                appointment.StartDateTime, utcNow, _bookingSettings.CancellationCutoffHours))
        {
            throw new BookingRuleException(
                "cancellation-window-passed",
                $"Terminet mund të anulohen deri {_bookingSettings.CancellationCutoffHours} orë para fillimit.");
        }

        appointment.Status = AppointmentStatus.CancelledByPatient;
        appointment.CancellationReason = request.Reason;
        appointment.CancelledByUserId = userId;
        appointment.CancelledAt = utcNow;

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetMyAppointmentByIdAsync(userId, appointmentId, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentCancelledAsync, userId, dto, cancellationToken);
        return dto;
    }

    public async Task<AppointmentDto> RescheduleAsync(
        Guid userId, Guid appointmentId, RescheduleAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        var existing = await GetOwnedAppointmentAsync(userId, appointmentId, cancellationToken);

        if (!BookingPolicy.IsPatientModifiable(existing.Status))
        {
            throw new BookingRuleException("not-reschedulable", $"Termini me status {existing.Status} nuk mund të riplanifikohet.");
        }

        var utcNow = _dateTimeProvider.UtcNow;
        if (!BookingPolicy.IsWithinCancellationWindow(
                existing.StartDateTime, utcNow, _bookingSettings.CancellationCutoffHours))
        {
            throw new BookingRuleException(
                "cancellation-window-passed",
                $"Terminet mund të riplanifikohen deri {_bookingSettings.CancellationCutoffHours} orë para fillimit.");
        }

        var newStartUtc = _timeZoneService.ToUtc(request.NewStartDateTime);
        if (newStartUtc <= utcNow)
        {
            throw new BookingRuleException("appointment-in-past", "Termini i ri nuk mund të jetë në të kaluarën.");
        }

        var durationMinutes = await GetEffectiveDurationAsync(existing.DoctorId, existing.MedicalServiceId, cancellationToken);
        var newEndUtc = newStartUtc.AddMinutes(durationMinutes);

        await EnsureNoPersonOverlapAsync(
            existing.PatientProfileId, existing.DependentId, newStartUtc, newEndUtc, existing.Id, cancellationToken);

        var slotAvailable = await _availabilityService.IsSlotAvailableAsync(
            existing.DoctorId, existing.ClinicBranchId, existing.MedicalServiceId, request.NewStartDateTime,
            excludeAppointmentId: existing.Id, cancellationToken);
        if (!slotAvailable)
        {
            throw new ConflictException("appointment-conflict", "Sloti i ri nuk është i lirë.");
        }

        // Termini i vjetër mbetet si histori (Rescheduled = jo-bllokues); krijohet termin i ri.
        // Të dy ndryshimet ruhen në një SaveChanges → një transaksion databaze.
        existing.Status = AppointmentStatus.Rescheduled;

        var replacement = new Appointment
        {
            ClinicId = existing.ClinicId,
            ClinicBranchId = existing.ClinicBranchId,
            DoctorId = existing.DoctorId,
            MedicalServiceId = existing.MedicalServiceId,
            PatientProfileId = existing.PatientProfileId,
            DependentId = existing.DependentId,
            StartDateTime = newStartUtc,
            EndDateTime = newEndUtc,
            Status = AppointmentStatus.Pending,
            PatientNote = existing.PatientNote
        };
        _dbContext.Appointments.Add(replacement);

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetMyAppointmentByIdAsync(userId, replacement.Id, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentRescheduledAsync, userId, dto, cancellationToken);
        return dto;
    }

    // ---------- Ndihmës ----------

    private async Task<Guid> GetPatientProfileIdAsync(Guid userId, CancellationToken cancellationToken)
    {
        var patientProfileId = await _dbContext.PatientProfiles
            .Where(p => p.UserId == userId)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return patientProfileId ?? throw new NotFoundException("Profili i pacientit nuk u gjet.");
    }

    private async Task<Appointment> GetOwnedAppointmentAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken)
    {
        // Pronësia kontrollohet në query — pacienti nuk mund të prekë terminet e të tjerëve
        // dhe as të mësojë që ato ekzistojnë (404, jo 403).
        return await _dbContext.Appointments
            .FirstOrDefaultAsync(a => a.Id == appointmentId && a.PatientProfile.UserId == userId, cancellationToken)
            ?? throw new NotFoundException("Appointment", appointmentId);
    }

    private async Task<int> GetEffectiveDurationAsync(Guid doctorId, Guid serviceId, CancellationToken cancellationToken)
    {
        var doctorService = await _dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId && ds.MedicalServiceId == serviceId && ds.IsActive)
            .Select(ds => new
            {
                ds.CustomDurationMinutes,
                BaseDuration = ds.MedicalService.DurationMinutes,
                ServiceActive = ds.MedicalService.IsActive
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BookingRuleException("service-not-offered-by-doctor", "Doktori nuk e ofron këtë shërbim.");

        if (!doctorService.ServiceActive)
        {
            throw new NotFoundException("MedicalService", serviceId);
        }

        return doctorService.CustomDurationMinutes ?? doctorService.BaseDuration;
    }

    /// <summary>Rregulli 10: i njëjti person (pacienti ose i njëjti dependent) s'mund të ketë dy termine njëkohësisht.</summary>
    private async Task EnsureNoPersonOverlapAsync(
        Guid patientProfileId, Guid? dependentId, DateTime startUtc, DateTime endUtc,
        Guid? excludeAppointmentId, CancellationToken cancellationToken)
    {
        var overlapExists = await _dbContext.Appointments.AnyAsync(a =>
            a.PatientProfileId == patientProfileId
            && a.DependentId == dependentId
            && Appointment.BlockingStatuses.Contains(a.Status)
            && a.StartDateTime < endUtc
            && a.EndDateTime > startUtc
            && (excludeAppointmentId == null || a.Id != excludeAppointmentId), cancellationToken);

        if (overlapExists)
        {
            throw new ConflictException(
                "patient-appointment-overlap", "Keni tashmë një termin që mbivendoset me këtë orar.");
        }
    }

    /// <summary>Përkthen gabimet e databazës në përgjigje 409 të kuptueshme.</summary>
    private async Task SaveChangesGuardedAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Shtresa 3: optimistic concurrency (xmin) — dikush e ndryshoi terminin ndërkohë.
            throw new ConflictException(
                "concurrency-conflict", "Termini u ndryshua nga një veprim tjetër. Rifresko dhe provo përsëri.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23P01" })
        {
            // Exclusion constraint (btree_gist) — dy kërkesa paralele për të njëjtin slot.
            throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është më i lirë.");
        }
    }

    private async Task NotifySafeAsync(
        Func<AppointmentNotificationContext, CancellationToken, Task> send,
        Guid userId, AppointmentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var user = await _dbContext.Users
                .Where(u => u.Id == userId)
                .Select(u => new { u.Email, u.PhoneNumber, u.FirstName, u.LastName })
                .FirstAsync(cancellationToken);

            var context = new AppointmentNotificationContext
            {
                AppointmentId = dto.Id,
                PatientEmail = user.Email!,
                PatientPhoneNumber = user.PhoneNumber,
                PatientName = $"{user.FirstName} {user.LastName}",
                DoctorName = dto.DoctorName,
                ClinicName = dto.ClinicName,
                ServiceName = dto.ServiceName,
                StartDateTimeLocal = dto.StartDateTime
            };

            await send(context, cancellationToken);
        }
        catch (Exception ex)
        {
            // Njoftimi nuk guxon ta rrëzojë rezervimin (kërkesa 14) — vetëm logohet.
            _logger.LogError(ex, "Njoftimi dështoi për terminin {AppointmentId}; rezervimi mbetet i vlefshëm", dto.Id);
        }
    }

    // ---------- Projeksioni ----------

    private sealed record AppointmentRow(
        Guid Id, Guid ClinicId, string ClinicName, Guid BranchId, string BranchName, string BranchAddress,
        Guid DoctorId, string DoctorFirstName, string DoctorLastName,
        Guid ServiceId, string ServiceName,
        Guid? DependentId, string? DependentFirstName, string? DependentLastName,
        DateTime StartUtc, DateTime EndUtc, AppointmentStatus Status,
        string? PatientNote, string? CancellationReason, DateTime? CancelledAt, DateTime CreatedAt);

    private IQueryable<AppointmentRow> QueryRows(
        System.Linq.Expressions.Expression<Func<Appointment, bool>> predicate)
    {
        return _dbContext.Appointments
            .Where(predicate)
            .Select(a => new AppointmentRow(
                a.Id, a.ClinicId, a.Clinic.Name, a.ClinicBranchId, a.ClinicBranch.Name, a.ClinicBranch.Address,
                a.DoctorId,
                _dbContext.Users.Where(u => u.Id == a.Doctor.UserId).Select(u => u.FirstName).First(),
                _dbContext.Users.Where(u => u.Id == a.Doctor.UserId).Select(u => u.LastName).First(),
                a.MedicalServiceId, a.MedicalService.Name,
                a.DependentId,
                a.Dependent != null ? a.Dependent.FirstName : null,
                a.Dependent != null ? a.Dependent.LastName : null,
                a.StartDateTime, a.EndDateTime, a.Status,
                a.PatientNote, a.CancellationReason, a.CancelledAt, a.CreatedAt));
    }

    private AppointmentDto ToDto(AppointmentRow row) => new()
    {
        Id = row.Id,
        ClinicId = row.ClinicId,
        ClinicName = row.ClinicName,
        ClinicBranchId = row.BranchId,
        BranchName = row.BranchName,
        BranchAddress = row.BranchAddress,
        DoctorId = row.DoctorId,
        DoctorName = $"{row.DoctorFirstName} {row.DoctorLastName}",
        MedicalServiceId = row.ServiceId,
        ServiceName = row.ServiceName,
        DependentId = row.DependentId,
        DependentName = row.DependentFirstName is null ? null : $"{row.DependentFirstName} {row.DependentLastName}",
        StartDateTime = _timeZoneService.ToLocal(row.StartUtc),
        EndDateTime = _timeZoneService.ToLocal(row.EndUtc),
        Status = row.Status,
        PatientNote = row.PatientNote,
        CancellationReason = row.CancellationReason,
        CancelledAt = row.CancelledAt is { } cancelledAt ? _timeZoneService.ToLocal(cancelledAt) : null,
        CreatedAt = _timeZoneService.ToLocal(row.CreatedAt)
    };
}
