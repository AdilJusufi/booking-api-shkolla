using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Doctors;
using Booking.Domain.Entities;
using Booking.Domain.Exceptions;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

public sealed class DoctorPhotoService : IDoctorPhotoService
{
    /// <summary>Pa SVG — dokument XML që mund të mbajë skript; një foto s'ka nevojë për të.</summary>
    private static readonly string[] AllowedFormats = ["jpg", "jpeg", "png", "webp"];

    /// <summary>5 MB — e njëjta vlerë si PHOTO_MAX_BYTES te DoctorPhotoUpload.tsx.</summary>
    private const long MaxFileSizeBytes = 5 * 1024 * 1024;

    private readonly BookingDbContext _dbContext;
    private readonly TenantAccessService _tenantAccess;
    private readonly CloudinaryUploadSigner _uploadSigner;
    private readonly IAuditService _auditService;

    public DoctorPhotoService(
        BookingDbContext dbContext,
        TenantAccessService tenantAccess,
        CloudinaryUploadSigner uploadSigner,
        IAuditService auditService)
    {
        _dbContext = dbContext;
        _tenantAccess = tenantAccess;
        _uploadSigner = uploadSigner;
        _auditService = auditService;
    }

    public async Task<DoctorSelfProfileDto> GetOwnProfileAsync(CancellationToken cancellationToken = default)
    {
        var userId = _tenantAccess.CurrentUserId;

        return await (
                from d in _dbContext.Doctors
                join user in _dbContext.Users on d.UserId equals user.Id
                where d.UserId == userId
                select new DoctorSelfProfileDto
                {
                    Id = d.Id,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    PhotoUrl = d.PhotoUrl
                })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Profili i mjekut për këtë përdorues nuk u gjet.");
    }

    public async Task<CloudinarySignatureDto> GenerateUploadSignatureAsync(
        Guid doctorId, CancellationToken cancellationToken = default)
    {
        await LoadForChangeAsync(doctorId, cancellationToken);
        return _uploadSigner.Sign(FolderFor(doctorId), AllowedFormats, MaxFileSizeBytes);
    }

    public async Task<DoctorPhotoDto> SetPhotoAsync(
        Guid doctorId, SetDoctorPhotoRequest request, CancellationToken cancellationToken = default)
    {
        var doctor = await LoadForChangeAsync(doctorId, cancellationToken);

        var newUrl = string.IsNullOrWhiteSpace(request.PhotoUrl) ? null : request.PhotoUrl.Trim();
        if (newUrl is not null && !_uploadSigner.IsOwnImageUrl(newUrl, FolderFor(doctorId), AllowedFormats))
        {
            throw new DomainException(
                "invalid-photo-url",
                "Fotoja duhet të jetë një imazh i ngarkuar në dosjen e këtij mjeku.");
        }

        var oldUrl = doctor.PhotoUrl;
        doctor.PhotoUrl = newUrl;

        _auditService.Record("DOCTOR_PHOTO_UPDATED", nameof(Doctor), doctorId.ToString(),
            new { PhotoUrl = oldUrl }, new { PhotoUrl = newUrl });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new DoctorPhotoDto { PhotoUrl = newUrl };
    }

    private static string FolderFor(Guid doctorId) => CloudinaryFolders.DoctorPhoto(doctorId);

    /// <summary>
    /// Vetë mjeku, ose kushdo që e menaxhon (admini i një klinike ku ai punon, SuperAdmin-i).
    /// Çdo tjetër — pacient, admin i një klinike tjetër, mjek tjetër — merr 403.
    /// </summary>
    private async Task<Doctor> LoadForChangeAsync(Guid doctorId, CancellationToken cancellationToken)
    {
        var doctor = await _dbContext.Doctors.FirstOrDefaultAsync(d => d.Id == doctorId, cancellationToken)
            ?? throw new NotFoundException(nameof(Doctor), doctorId);

        if (doctor.UserId != _tenantAccess.CurrentUserId)
        {
            await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);
        }

        return doctor;
    }
}
