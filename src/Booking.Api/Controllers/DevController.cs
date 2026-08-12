using Booking.Infrastructure.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>
/// Ndihmësa vetëm për zhvillim. Jashtë Development-it çdo endpoint këtu kthen 404
/// dhe DevEmailInbox as nuk regjistrohet fare në DI.
/// Qëllimi: token-at e konfirmimit të email-it dhe të rivendosjes së password-it
/// të jenë të arritshëm nga frontend-i pa pasur qasje në logjet e serverit.
/// </summary>
[ApiController]
[Route("api/dev")]
[AllowAnonymous]
[ApiExplorerSettings(IgnoreApi = true)]
public class DevController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly IServiceProvider _serviceProvider;

    public DevController(IWebHostEnvironment environment, IServiceProvider serviceProvider)
    {
        _environment = environment;
        _serviceProvider = serviceProvider;
    }

    /// <summary>Email-at e fundit "të dërguar", më i riu i pari.</summary>
    [HttpGet("emails")]
    [ProducesResponseType(typeof(IReadOnlyList<DevEmail>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult<IReadOnlyList<DevEmail>> GetEmails([FromQuery] string? toEmail)
    {
        if (!_environment.IsDevelopment())
        {
            return NotFound();
        }

        var inbox = _serviceProvider.GetService<DevEmailInbox>();
        if (inbox is null)
        {
            return NotFound();
        }

        return Ok(inbox.Recent(toEmail));
    }
}
