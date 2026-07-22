using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Clinics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Veprimet globale të SuperAdmin: specializime, përdorues, audit logs.</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = Policies.SuperAdminOnly)]
public class AdminController : ControllerBase
{
    private readonly ISuperAdminService _superAdminService;

    public AdminController(ISuperAdminService superAdminService)
    {
        _superAdminService = superAdminService;
    }

    [HttpPost("specialties")]
    [ProducesResponseType(typeof(SpecialtyDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<SpecialtyDto>> CreateSpecialty(
        CreateSpecialtyRequest request, CancellationToken cancellationToken)
    {
        var specialty = await _superAdminService.CreateSpecialtyAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, specialty);
    }

    [HttpPut("specialties/{id:guid}")]
    [ProducesResponseType(typeof(SpecialtyDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<SpecialtyDto>> UpdateSpecialty(
        Guid id, UpdateSpecialtyRequest request, CancellationToken cancellationToken) =>
        Ok(await _superAdminService.UpdateSpecialtyAsync(id, request, cancellationToken));

    [HttpDelete("specialties/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteSpecialty(Guid id, CancellationToken cancellationToken)
    {
        await _superAdminService.DeleteSpecialtyAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("users/{id:guid}/deactivate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeactivateUser(Guid id, CancellationToken cancellationToken)
    {
        await _superAdminService.SetUserActiveAsync(id, false, cancellationToken);
        return NoContent();
    }

    [HttpPost("users/{id:guid}/activate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> ActivateUser(Guid id, CancellationToken cancellationToken)
    {
        await _superAdminService.SetUserActiveAsync(id, true, cancellationToken);
        return NoContent();
    }

    [HttpGet("audit-logs")]
    [ProducesResponseType(typeof(PagedResult<AuditLogDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AuditLogDto>>> GetAuditLogs(
        [FromQuery] AuditLogQuery query, CancellationToken cancellationToken) =>
        Ok(await _superAdminService.GetAuditLogsAsync(query, cancellationToken));
}
