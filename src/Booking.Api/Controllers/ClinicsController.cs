using Booking.Application.Common.Models;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Doctors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Kërkimi publik i klinikave — pa autentifikim.</summary>
[ApiController]
[Route("api/clinics")]
[AllowAnonymous]
public class ClinicsController : ControllerBase
{
    private readonly IClinicQueryService _clinicQueryService;

    public ClinicsController(IClinicQueryService clinicQueryService)
    {
        _clinicQueryService = clinicQueryService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ClinicDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<ClinicDto>>> Search(
        [FromQuery] ClinicSearchRequest request, CancellationToken cancellationToken) =>
        Ok(await _clinicQueryService.SearchAsync(request, cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ClinicDetailsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ClinicDetailsDto>> GetById(Guid id, CancellationToken cancellationToken) =>
        Ok(await _clinicQueryService.GetByIdAsync(id, cancellationToken));

    [HttpGet("{id:guid}/branches")]
    [ProducesResponseType(typeof(IReadOnlyList<ClinicBranchDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ClinicBranchDto>>> GetBranches(Guid id, CancellationToken cancellationToken) =>
        Ok(await _clinicQueryService.GetBranchesAsync(id, cancellationToken));

    [HttpGet("{id:guid}/doctors")]
    [ProducesResponseType(typeof(IReadOnlyList<DoctorDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DoctorDto>>> GetDoctors(Guid id, CancellationToken cancellationToken) =>
        Ok(await _clinicQueryService.GetDoctorsAsync(id, cancellationToken));

    [HttpGet("{id:guid}/services")]
    [ProducesResponseType(typeof(IReadOnlyList<MedicalServiceDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<MedicalServiceDto>>> GetServices(Guid id, CancellationToken cancellationToken) =>
        Ok(await _clinicQueryService.GetServicesAsync(id, cancellationToken));
}
