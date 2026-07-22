using Booking.Application.Common.Exceptions;
using Booking.Domain.Exceptions;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Middleware;

/// <summary>
/// Kap çdo exception dhe e kthen si ProblemDetails (RFC 7807) me status code të saktë.
/// Gabimet e papritura (500) nuk zbulojnë detaje të brendshme.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private const string ErrorTypeBaseUrl = "https://booking-api.dev/errors";

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception exception)
        {
            await HandleExceptionAsync(context, exception);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var problemDetails = exception switch
        {
            ValidationException validationException => CreateValidationProblem(validationException),

            NotFoundException => CreateProblem(
                StatusCodes.Status404NotFound, "not-found", "Resursi nuk u gjet", exception.Message),

            AuthenticationFailedException => CreateProblem(
                StatusCodes.Status401Unauthorized, "authentication-failed", "Autentifikimi dështoi", exception.Message),

            ForbiddenAccessException => CreateProblem(
                StatusCodes.Status403Forbidden, "forbidden", "Qasja u refuzua", exception.Message),

            ConflictException conflictException => CreateProblem(
                StatusCodes.Status409Conflict, conflictException.ErrorCode, "Konflikt", exception.Message),

            BookingRuleException bookingRuleException => CreateProblem(
                StatusCodes.Status422UnprocessableEntity, bookingRuleException.ErrorCode,
                "Shkelje e rregullave të rezervimit", exception.Message),

            DomainException domainException => CreateProblem(
                StatusCodes.Status400BadRequest, domainException.ErrorCode, "Kërkesë e pavlefshme", exception.Message),

            _ => CreateProblem(
                StatusCodes.Status500InternalServerError, "internal-error", "Gabim i brendshëm",
                "Ndodhi një gabim i papritur. Provo përsëri më vonë.")
        };

        if (problemDetails.Status == StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(exception, "Gabim i patrajtuar në {Path}", context.Request.Path);
        }

        problemDetails.Instance = context.Request.Path;
        problemDetails.Extensions["traceId"] = context.TraceIdentifier;

        context.Response.StatusCode = problemDetails.Status!.Value;
        context.Response.ContentType = "application/problem+json";
        await context.Response.WriteAsJsonAsync(problemDetails);
    }

    private static ProblemDetails CreateProblem(int status, string errorCode, string title, string detail) =>
        new()
        {
            Type = $"{ErrorTypeBaseUrl}/{errorCode}",
            Title = title,
            Status = status,
            Detail = detail
        };

    private static ValidationProblemDetails CreateValidationProblem(ValidationException exception)
    {
        var errors = exception.Errors
            .GroupBy(e => e.PropertyName)
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());

        return new ValidationProblemDetails(errors)
        {
            Type = $"{ErrorTypeBaseUrl}/validation",
            Title = "Validimi dështoi",
            Status = StatusCodes.Status422UnprocessableEntity,
            Detail = "Një ose më shumë fusha janë të pavlefshme."
        };
    }
}
