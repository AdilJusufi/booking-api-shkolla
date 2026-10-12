using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Doctors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>
/// Fotoja e mjekut. Qasja s'varet nga roli: e ndryshon vetë mjeku ose admini i një klinike
/// ku ai punon — pronësia verifikohet në DoctorPhotoService, çdo tjetër merr 403.
/// </summary>
[ApiController]
[Route("api/doctors/{id:guid}/photo")]
[Authorize]
public class DoctorPhotoController : ControllerBase
{
    private readonly IDoctorPhotoService _doctorPhotoService;

    public DoctorPhotoController(IDoctorPhotoService doctorPhotoService)
    {
        _doctorPhotoService = doctorPhotoService;
    }

    /// <summary>Profili i mjekut të kyçur (id + foto) — për avatarin e panelit të mjekut.</summary>
    [HttpGet("~/api/doctor/me")]
    [Authorize(Policy = Policies.DoctorOnly)]
    [ProducesResponseType(typeof(DoctorSelfProfileDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<DoctorSelfProfileDto>> GetOwnProfile(CancellationToken cancellationToken) =>
        Ok(await _doctorPhotoService.GetOwnProfileAsync(cancellationToken));

    /// <summary>503 "uploads-not-configured" kur Cloudinary s'është konfiguruar në këtë mjedis.</summary>
    [HttpGet("upload-signature")]
    [ProducesResponseType(typeof(CloudinarySignatureDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<CloudinarySignatureDto>> GetUploadSignature(
        Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorPhotoService.GenerateUploadSignatureAsync(id, cancellationToken));

    /// <summary>Ruan URL-në e kthyer nga Cloudinary, ose e heq foton me photoUrl = null.</summary>
    [HttpPut]
    [ProducesResponseType(typeof(DoctorPhotoDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<DoctorPhotoDto>> SetPhoto(
        Guid id, SetDoctorPhotoRequest request, CancellationToken cancellationToken) =>
        Ok(await _doctorPhotoService.SetPhotoAsync(id, request, cancellationToken));
}
