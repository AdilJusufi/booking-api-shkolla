using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Availability;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Domain.Exceptions;
using Booking.Domain.Services;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Booking.Infrastructure.Services;

public class AdminAppointmentService : IAdminAppointmentService
{
    private readonly BookingDbContext _dbContext;
    private readonly TenantAccessService _tenantAccess;
    private readonly IAvailabilityService _availabilityService;
    private readonly IAppointmentNotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;
    private readonly ILogger<AdminAppointmentService> _logger;

    public AdminAppointmentService(
        BookingDbContext dbContext,
        TenantAccessService tenantAccess,
        IAvailabilityService availabilityService,
        IAppointmentNotificationService notificationService,
        IAuditService auditService,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService,
        ILogger<AdminAppointmentService> logger)
    {
        _dbContext = dbContext;
        _tenantAccess = tenantAccess;
        _availabilityService = availabilityService;
        _notificationService = notificationService;
        _auditService = auditService;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
        _logger = logger;
    }

    public async Task<DoctorAppointmentDto> CreateForPatientAsync(
        AdminCreateAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        var branch = await _dbContext.ClinicBranches
            .Where(b => b.Id == request.ClinicBranchId && b.IsActive)
            .Select(b => new { b.ClinicId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("ClinicBranch", request.ClinicBranchId);

        await _tenantAccess.EnsureCanManageClinicAsync(branch.ClinicId, cancellationToken);

        var patient = await (
                from p in _dbContext.PatientProfiles
                join u in _dbContext.Users on p.UserId equals u.Id
                where u.Email == request.PatientEmail && u.IsActive
                select new { PatientProfileId = p.Id, p.UserId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Pacienti me këtë email nuk u gjet.");

        if (request.DependentId is { } dependentId)
        {
            var ownsDependent = await _dbContext.Dependents.AnyAsync(
                d => d.Id == dependentId && d.PatientProfileId == patient.PatientProfileId && d.IsActive, cancellationToken);
            if (!ownsDependent)
            {
                throw new BookingRuleException("dependent-not-owned", "Dependenti nuk i përket këtij pacienti.");
            }
        }

        var startUtc = _timeZoneService.ToUtc(request.StartDateTime);
        if (startUtc <= _dateTimeProvider.UtcNow)
        {
            throw new BookingRuleException("appointment-in-past", "Termini nuk mund të rezervohet në të kaluarën.");
        }

        var durationMinutes = await GetEffectiveDurationAsync(request.DoctorId, request.MedicalServiceId, cancellationToken);
        var endUtc = startUtc.AddMinutes(durationMinutes);

        var personOverlap = await _dbContext.Appointments.AnyAsync(a =>
            a.PatientProfileId == patient.PatientProfileId
            && a.DependentId == request.DependentId
            && Appointment.BlockingStatuses.Contains(a.Status)
            && a.StartDateTime < endUtc
            && a.EndDateTime > startUtc, cancellationToken);
        if (personOverlap)
        {
            throw new ConflictException("patient-appointment-overlap", "Pacienti ka tashmë termin në këtë orar.");
        }

        var slotAvailable = await _availabilityService.IsSlotAvailableAsync(
            request.DoctorId, request.ClinicBranchId, request.MedicalServiceId, request.StartDateTime,
            excludeAppointmentId: null, cancellationToken);
        if (!slotAvailable)
        {
            throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është i lirë.");
        }

        var appointment = new Appointment
        {
            ClinicId = branch.ClinicId,
            ClinicBranchId = request.ClinicBranchId,
            DoctorId = request.DoctorId,
            MedicalServiceId = request.MedicalServiceId,
            PatientProfileId = patient.PatientProfileId,
            DependentId = request.DependentId,
            StartDateTime = startUtc,
            EndDateTime = endUtc,
            Status = AppointmentStatus.Confirmed, // e krijoi vetë klinika — konfirmohet direkt
            PatientNote = request.PatientNote,
            InternalNote = request.InternalNote
        };
        _dbContext.Appointments.Add(appointment);

        _auditService.Record("APPOINTMENT_CREATED_BY_ADMIN", nameof(Appointment), appointment.Id.ToString(), null,
            new { request.PatientEmail, request.DoctorId, StartUtc = startUtc, EndUtc = endUtc });

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetDtoAsync(appointment.Id, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentCreatedAsync, patient.UserId, dto, cancellationToken);
        return dto;
    }

    public async Task<DoctorAppointmentDto> UpdateAsync(
        Guid appointmentId, AdminUpdateAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageAppointmentAsync(appointmentId, cancellationToken);
        var appointment = await GetAppointmentAsync(appointmentId, cancellationToken);

        var oldValues = new { appointment.Status, appointment.InternalNote };

        if (request.Status is { } targetStatus)
        {
            if (!BookingPolicy.CanTransition(appointment.Status, targetStatus))
            {
                throw new BookingRuleException(
                    "invalid-status-transition", $"Kalimi nga {appointment.Status} në {targetStatus} nuk lejohet.");
            }

            appointment.Status = targetStatus;
        }

        if (request.InternalNote is not null)
        {
            appointment.InternalNote = request.InternalNote;
        }

        _auditService.Record("APPOINTMENT_UPDATED_BY_ADMIN", nameof(Appointment), appointmentId.ToString(),
            oldValues, new { appointment.Status, appointment.InternalNote });

        await SaveChangesGuardedAsync(cancellationToken);
        return await GetDtoAsync(appointmentId, cancellationToken);
    }

    public async Task<DoctorAppointmentDto> CancelAsync(
        Guid appointmentId, AdminCancelAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageAppointmentAsync(appointmentId, cancellationToken);
        var appointment = await GetAppointmentAsync(appointmentId, cancellationToken);

        if (!BookingPolicy.CanTransition(appointment.Status, AppointmentStatus.CancelledByClinic))
        {
            throw new BookingRuleException(
                "not-cancellable", $"Termini me status {appointment.Status} nuk mund të anulohet.");
        }

        // Klinika s'ka kufizim orësh — por çdo anulim administrativ auditohet.
        _auditService.Record("APPOINTMENT_CANCELLED_BY_ADMIN", nameof(Appointment), appointmentId.ToString(),
            new { appointment.Status }, new { Status = AppointmentStatus.CancelledByClinic, request.Reason });

        appointment.Status = AppointmentStatus.CancelledByClinic;
        appointment.CancellationReason = request.Reason;
        appointment.CancelledByUserId = _tenantAccess.CurrentUserId;
        appointment.CancelledAt = _dateTimeProvider.UtcNow;

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetDtoAsync(appointmentId, cancellationToken);
        var patientUserId = await GetPatientUserIdAsync(appointment.PatientProfileId, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentCancelledAsync, patientUserId, dto, cancellationToken);
        return dto;
    }

    public async Task<DoctorAppointmentDto> RescheduleAsync(
        Guid appointmentId, AdminRescheduleAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageAppointmentAsync(appointmentId, cancellationToken);
        var existing = await GetAppointmentAsync(appointmentId, cancellationToken);

        if (!BookingPolicy.CanTransition(existing.Status, AppointmentStatus.Rescheduled))
        {
            throw new BookingRuleException(
                "not-reschedulable", $"Termini me status {existing.Status} nuk mund të riplanifikohet.");
        }

        var newStartUtc = _timeZoneService.ToUtc(request.NewStartDateTime);
        if (newStartUtc <= _dateTimeProvider.UtcNow)
        {
            throw new BookingRuleException("appointment-in-past", "Termini i ri nuk mund të jetë në të kaluarën.");
        }

        var durationMinutes = await GetEffectiveDurationAsync(existing.DoctorId, existing.MedicalServiceId, cancellationToken);
        var newEndUtc = newStartUtc.AddMinutes(durationMinutes);

        var slotAvailable = await _availabilityService.IsSlotAvailableAsync(
            existing.DoctorId, existing.ClinicBranchId, existing.MedicalServiceId, request.NewStartDateTime,
            excludeAppointmentId: existing.Id, cancellationToken);
        if (!slotAvailable)
        {
            throw new ConflictException("appointment-conflict", "Sloti i ri nuk është i lirë.");
        }

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
            Status = AppointmentStatus.Confirmed,
            PatientNote = existing.PatientNote,
            InternalNote = existing.InternalNote
        };
        _dbContext.Appointments.Add(replacement);

        // Rregulli 13: riplanifikimi nga ClinicAdmin ruhet gjithmonë në audit log.
        _auditService.Record("APPOINTMENT_RESCHEDULED_BY_ADMIN", nameof(Appointment), existing.Id.ToString(),
            new { OldStart = existing.StartDateTime, OldEnd = existing.EndDateTime },
            new { NewAppointmentId = replacement.Id, NewStart = newStartUtc, NewEnd = newEndUtc });

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetDtoAsync(replacement.Id, cancellationToken);
        var patientUserId = await GetPatientUserIdAsync(existing.PatientProfileId, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentRescheduledAsync, patientUserId, dto, cancellationToken);
        return dto;
    }

    // ---------- Ndihmës ----------

    private async Task<Appointment> GetAppointmentAsync(Guid appointmentId, CancellationToken cancellationToken) =>
        await _dbContext.Appointments.FirstOrDefaultAsync(a => a.Id == appointmentId, cancellationToken)
        ?? throw new NotFoundException("Appointment", appointmentId);

    private async Task<int> GetEffectiveDurationAsync(Guid doctorId, Guid serviceId, CancellationToken cancellationToken)
    {
        var doctorService = await _dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId && ds.MedicalServiceId == serviceId && ds.IsActive)
            .Select(ds => new { ds.CustomDurationMinutes, BaseDuration = ds.MedicalService.DurationMinutes })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BookingRuleException("service-not-offered-by-doctor", "Doktori nuk e ofron këtë shërbim.");

        return doctorService.CustomDurationMinutes ?? doctorService.BaseDuration;
    }

    private async Task<Guid> GetPatientUserIdAsync(Guid patientProfileId, CancellationToken cancellationToken) =>
        await _dbContext.PatientProfiles
            .Where(p => p.Id == patientProfileId)
            .Select(p => p.UserId)
            .FirstAsync(cancellationToken);

    private async Task SaveChangesGuardedAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException(
                "concurrency-conflict", "Termini u ndryshua nga një veprim tjetër. Rifresko dhe provo përsëri.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23P01" })
        {
            throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është më i lirë.");
        }
    }

    private async Task NotifySafeAsync(
        Func<AppointmentNotificationContext, CancellationToken, Task> send,
        Guid patientUserId, DoctorAppointmentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var user = await _dbContext.Users
                .Where(u => u.Id == patientUserId)
                .Select(u => new { u.Email, u.PhoneNumber, u.FirstName, u.LastName })
                .FirstAsync(cancellationToken);

            var clinicName = await _dbContext.ClinicBranches
                .Where(b => b.Id == dto.ClinicBranchId)
                .Select(b => b.Clinic.Name)
                .FirstAsync(cancellationToken);

            var doctorName = await _dbContext.Appointments
                .Where(a => a.Id == dto.Id)
                .Select(a => _dbContext.Users
                    .Where(u => u.Id == a.Doctor.UserId)
                    .Select(u => u.FirstName + " " + u.LastName)
                    .First())
                .FirstAsync(cancellationToken);

            await send(new AppointmentNotificationContext
            {
                AppointmentId = dto.Id,
                PatientEmail = user.Email!,
                PatientPhoneNumber = user.PhoneNumber,
                PatientName = $"{user.FirstName} {user.LastName}",
                DoctorName = doctorName,
                ClinicName = clinicName,
                ServiceName = dto.ServiceName,
                StartDateTimeLocal = dto.StartDateTime
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Njoftimi dështoi për terminin {AppointmentId}; veprimi mbetet i vlefshëm", dto.Id);
        }
    }

    private async Task<DoctorAppointmentDto> GetDtoAsync(Guid appointmentId, CancellationToken cancellationToken)
    {
        var row = await _dbContext.Appointments
            .Where(a => a.Id == appointmentId)
            .Select(a => new
            {
                a.Id,
                a.ClinicBranchId,
                BranchName = a.ClinicBranch.Name,
                a.MedicalServiceId,
                ServiceName = a.MedicalService.Name,
                PatientFirstName = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.FirstName).First(),
                PatientLastName = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.LastName).First(),
                PatientPhoneNumber = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.PhoneNumber).First(),
                a.DependentId,
                DependentFirstName = a.Dependent != null ? a.Dependent.FirstName : null,
                DependentLastName = a.Dependent != null ? a.Dependent.LastName : null,
                a.StartDateTime,
                a.EndDateTime,
                a.Status,
                a.PatientNote,
                a.InternalNote,
                a.CancellationReason
            })
            .FirstAsync(cancellationToken);

        return new DoctorAppointmentDto
        {
            Id = row.Id,
            ClinicBranchId = row.ClinicBranchId,
            BranchName = row.BranchName,
            MedicalServiceId = row.MedicalServiceId,
            ServiceName = row.ServiceName,
            PatientName = $"{row.PatientFirstName} {row.PatientLastName}",
            PatientPhoneNumber = row.PatientPhoneNumber,
            DependentId = row.DependentId,
            DependentName = row.DependentFirstName is null ? null : $"{row.DependentFirstName} {row.DependentLastName}",
            StartDateTime = _timeZoneService.ToLocal(row.StartDateTime),
            EndDateTime = _timeZoneService.ToLocal(row.EndDateTime),
            Status = row.Status,
            PatientNote = row.PatientNote,
            InternalNote = row.InternalNote,
            CancellationReason = row.CancellationReason
        };
    }
}
