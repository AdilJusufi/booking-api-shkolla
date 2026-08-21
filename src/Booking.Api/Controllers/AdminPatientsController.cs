using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Booking.Api.Controllers;

/// <summary>
/// Kërkimi dhe krijimi i pacientëve nga recepsioni — baza e rezervimit me telefon.
/// Politika ClinicAdminOnly përfshin edhe SuperAdmin-in.
/// </summary>
[ApiController]
[Route("api/admin/patients")]
[Authorize(Policy = Policies.ClinicAdminOnly)]
public class AdminPatientsController : ControllerBase
{
    private readonly IAdminPatientService _adminPatientService;

    public AdminPatientsController(IAdminPatientService adminPatientService)
    {
        _adminPatientService = adminPatientService;
    }

    /// <summary>
    /// Kërkon pacientë sipas email-it, telefonit ose emrit. Shtrirja varet nga forma
    /// e query-t — shih AdminPatientService. Kurrë nuk kthen PersonalNumber.
    /// Rate limit i veçantë: ekspozon të dhëna pacientësh, prandaj kufizohet edhe
    /// përtej minimumit prej 3 karakteresh.
    /// </summary>
    [HttpGet("search")]
    [EnableRateLimiting("patient-search")]
    [ProducesResponseType(typeof(PagedResult<AdminPatientSearchResultDto>), StatusCodes.Status200OK)]
    // Parametri NUK quhet "query": model binding-u e merr emrin e parametrit si
    // prefiks, dhe atëherë ?query=... do të kërkohej si ?query.Query=... → 400.
    public async Task<ActionResult<PagedResult<AdminPatientSearchResultDto>>> Search(
        [FromQuery] AdminPatientSearchQuery request, CancellationToken cancellationToken) =>
        Ok(await _adminPatientService.SearchAsync(request, cancellationToken));

    /// <summary>
    /// Krijon një pacient që s'ka llogari. Llogaria hapet pa password; pacienti e merr
    /// në dorëzim me "kam harruar fjalëkalimin" nëse ka dhënë email.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(AdminPatientDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminPatientDto>> Create(
        AdminCreatePatientRequest request, CancellationToken cancellationToken)
    {
        var patient = await _adminPatientService.CreateAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, patient);
    }
}
