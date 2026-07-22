using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Security;
using Booking.Application.Features.Patients;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Profili i pacientit të kyçur dhe dependentët e tij.</summary>
[ApiController]
[Route("api/patients")]
[Authorize(Policy = Policies.PatientOnly)]
public class PatientsController : ControllerBase
{
    private readonly IPatientService _patientService;
    private readonly ICurrentUserService _currentUser;

    public PatientsController(IPatientService patientService, ICurrentUserService currentUser)
    {
        _patientService = patientService;
        _currentUser = currentUser;
    }

    private Guid UserId => _currentUser.UserId ?? throw new AuthenticationFailedException();

    [HttpGet("me")]
    [ProducesResponseType(typeof(PatientProfileDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<PatientProfileDto>> GetMe(CancellationToken cancellationToken) =>
        Ok(await _patientService.GetMeAsync(UserId, cancellationToken));

    [HttpPut("me")]
    [ProducesResponseType(typeof(PatientProfileDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<PatientProfileDto>> UpdateMe(
        UpdatePatientProfileRequest request, CancellationToken cancellationToken) =>
        Ok(await _patientService.UpdateMeAsync(UserId, request, cancellationToken));

    [HttpGet("me/dependents")]
    [ProducesResponseType(typeof(IReadOnlyList<DependentDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DependentDto>>> GetDependents(CancellationToken cancellationToken) =>
        Ok(await _patientService.GetDependentsAsync(UserId, cancellationToken));

    [HttpPost("me/dependents")]
    [ProducesResponseType(typeof(DependentDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<DependentDto>> AddDependent(
        CreateDependentRequest request, CancellationToken cancellationToken)
    {
        var dependent = await _patientService.AddDependentAsync(UserId, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, dependent);
    }

    [HttpPut("me/dependents/{id:guid}")]
    [ProducesResponseType(typeof(DependentDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<DependentDto>> UpdateDependent(
        Guid id, UpdateDependentRequest request, CancellationToken cancellationToken) =>
        Ok(await _patientService.UpdateDependentAsync(UserId, id, request, cancellationToken));

    [HttpDelete("me/dependents/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteDependent(Guid id, CancellationToken cancellationToken)
    {
        await _patientService.DeleteDependentAsync(UserId, id, cancellationToken);
        return NoContent();
    }
}
